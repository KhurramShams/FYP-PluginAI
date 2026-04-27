import uuid
from fastapi import APIRouter, Depends
from Integrations.pinecone_client import supabase
from fastapi import File, UploadFile
from fastapi import BackgroundTasks, HTTPException
from datetime import datetime
from Utils.RagUtils.vector_store_Utils import delete_file_vector_from_pinecone
from Utils.RagUtils.Embedding_Utils import embed_and_save_chunks
from Utils.MainUtils.User_Utils import user_exists
from Utils.MainUtils.Workspace_Utils import validate_workspace_exists
from Utils.MainUtils.File_Utils import text_extraction_page_wise
from Utils.RagUtils.Chunking_Utils import hierarchical_semantic_chunking
from Services.email_service import send_file_upload_email,send_file_delete_email
from fastapi import BackgroundTasks, HTTPException
from Services.activity_logger import log_file_upload, log_file_delete
from fastapi import Request
from Services.auth_dependency import get_current_user, verify_ownership

# Router
router = APIRouter(tags=["Files Upload End-Points"])

@router.post("/upload_file")
async def upload_document(Requests: Request, background_tasks: BackgroundTasks, user_id: str, workspace_name: str, current_user  = Depends(get_current_user),file: UploadFile = File(...),description: str = "No description provided"):
    try:

        verify_ownership(current_user, user_id)

        user_exists(user_id)
        await validate_workspace_exists(workspace_name)

        user_data = supabase.table("DimUsers").select("*").eq("user_id",user_id).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="user data not found.")
        user_data = user_data.data[0]


        usage_result =supabase.table("FactWorkSpaceUsage").select("*").eq("workspace_name",workspace_name).execute()
        if not usage_result .data:
            raise HTTPException(status_code=404, detail="Workspace usage data not found.")
        
        usage = usage_result.data[0]

        if usage["user_upload"] >= usage["max_upload"]:
            raise HTTPException(
                status_code=403, 
                detail="Upload limit reached for your subscription plan."
            )

        file_ext=file.filename.split('.')[-1].lower()
        valid_type=["pdf","txt","docx"]

        if file_ext not in valid_type: 
            raise HTTPException(status_code=400, detail="Unsupported file type")
        print("Checking file upload...")
        filedata=supabase.table("DimUserDocuments").select("*").eq("file_name",file.filename).eq("workspace_name",workspace_name).eq("user_id",user_id).execute()
        if filedata.data:
            raise HTTPException(status_code=400, detail="File with the same name already exists in this workspace.")

        file_bytes = await file.read()
        max_size = 10 * 1024 * 1024  # 10 MB
        file_size = len(file_bytes)
        if file_size > max_size:
            raise HTTPException(status_code=400, detail="File is too large. Maximum size: 10MB")
        
        doc_id=str(uuid.uuid4())
        file_path = f"user_docs/{user_id}/{workspace_name}/{doc_id}/{file.filename}"
        
        pages = await text_extraction_page_wise(file_bytes, file_ext)
        chunks = await hierarchical_semantic_chunking(
            pages=pages,
            workspace_name=workspace_name,
            document_id=doc_id,
            token_size=400,
            overlap_size=50
        )
        print(f"Total chunks created: {len(chunks)}")  # Debug: Print number of chunks created
            
        await embed_and_save_chunks(chunks)
        
        # --- Upload file to Supabase Storage ---
        try:
            supabase.storage.from_("PDF").upload(
                file_path,
                file_bytes
                )
            file_url = supabase.storage.from_("PDF").get_public_url(file_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload file to Supabase: {str(e)}")

        # --- Store metadata in DB ---
        supabase.table("DimUserDocuments").insert({
            "doc_id": doc_id,
            "file_name": file.filename,
            "file_path": file_path,
            "file_url": file_url,
            "file_extension": file_ext,
            "uploaded_at": datetime.utcnow().isoformat(),
            "workspace_name": workspace_name,
            "user_id": user_id,
            "file_size": file_size,
            "file_description": description,
            "status": "Uploaded",
        }).execute()
        
        # --- Update workspace usage count ---
        supabase.table("FactWorkSpaceUsage").update({
            "user_upload": usage["user_upload"] + 1
        }).eq("workspace_name", workspace_name).execute()

        # --- Update subscription usage count ---
        SubscriptionData = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).execute()
        
        if not SubscriptionData.data:
            raise HTTPException(status_code=404, detail="Subscription data not found.")
        subscription_id = SubscriptionData.data[0]["subscription_id"]

        # --- Update subscription usage count ---
        SubscriptionUsage = supabase.table("FactSubscriptionUsage").select("*").eq("subscription_id", subscription_id).execute()
        if not SubscriptionUsage.data:
            raise HTTPException(status_code=404, detail="Subscription usage data not found.")
        SubscriptionUsage = SubscriptionUsage.data[0]
        
        supabase.table("FactSubscriptionUsage").update({"user_uploded_docs": SubscriptionUsage["user_uploded_docs"] + 1}).eq("subscription_id", subscription_id).execute()
        
        background_tasks.add_task(
            send_file_upload_email,
            to_email = user_data['email'],
            file_name = file.filename,
            workspace_name = workspace_name,
            file_size_kb = round(len(file_bytes) / 1024, 2)
        )
        
        background_tasks.add_task(
            log_file_upload,
            user_id = user_id,
            file_name = file.filename,
            workspace_name = workspace_name ,
            file_type = file_ext,
            file_size_kb = file_size,
            document_id = doc_id,
            request = Requests
        )
        return {
            "status": "success",
            "message": "File uploaded successfully",
            "document_id": doc_id,
            "file_url": file_url
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    
@router.get("/delete_file/{doc_id}")
async def delete_uploded_file(Requests: Request, doc_id:str,background_tasks: BackgroundTasks, current_user  = Depends(get_current_user)):
    try:
        print("Delete file endpoint called...!")
        
        file_data=supabase.table("DimUserDocuments").select("*").eq("doc_id",doc_id).execute()
        if not file_data.data:
            raise HTTPException(status_code=404, detail="File not found.")
        file_record = file_data.data[0]
        file_path=file_record["file_path"]
        
        # --- Delete from Supabase Storage ---
        try:
            supabase.storage.from_("PDF").remove([file_path])
            supabase.table("DimUserDocuments").delete().eq("doc_id",doc_id).execute()

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file from storage/supabase: {str(e)}")

        usagedata=supabase.table("FactWorkSpaceUsage").select("*").eq("workspace_name",file_record["workspace_name"]).execute()
        if usagedata.data:
            usage=usagedata.data[0]
            supabase.table("FactWorkSpaceUsage").update({
                "user_upload": max(0,usage["user_upload"] - 1)
            }).eq("workspace_name",file_record["workspace_name"]).execute()
        else:
            print("Workspace usage data not found during deletion.")
            
        # --- Delete From Pinecone ---
        try:
            await delete_file_vector_from_pinecone(doc_id=doc_id, workspace_name = file_record['workspace_name'])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete from Pinecone: {str(e)}")
        
        user_data = supabase.table("DimUsers").select("*").eq("user_id",file_record["user_id"]).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="user data not found.")
        user_data = user_data.data[0]

        background_tasks.add_task(
            send_file_delete_email,
            to_email = user_data['email'],
            file_name = file_record["file_name"],
            workspace_name = file_record['workspace_name'],
        )

        background_tasks.add_task(
            log_file_delete,
            user_id = file_record["user_id"],
            file_name = file_record["file_name"],
            workspace_name = file_record['workspace_name'],
            document_id = doc_id,
            request = Requests,
        )
        
        return {
            "status": "success",
            "message": "File deleted successfully",
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete whole file data : {str(e)}")

@router.get("/get-file-by-Id/{doc_id}")
async def get_file_by_Id(doc_id, current_user  = Depends(get_current_user)):
    try:
        filecheck=supabase.table("DimUserDocuments").select("*").eq("doc_id",doc_id).execute()
        if not filecheck.data:
            raise HTTPException(status_code=404, detail="File not found.")
        return {
            "status": "success",
            "file": filecheck.data[0]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get file by ID: {str(e)}")

@router.get("/get_file_by_workspace/{workspace_name}")
async def get_all_files_by_workspace(workspace_name:str, current_user  = Depends(get_current_user)):
    try:
        print("Working")

        workspace_data = supabase.table("DimWorkSpaces").select("*").eq("workspace_name", workspace_name).execute()
        if not workspace_data.data:
            raise HTTPException(status_code=404, detail="Workspace not found")

        files=supabase.table("DimUserDocuments").select("*").eq("workspace_name",workspace_name).execute()
        if not files.data:
            return {
                "status": "success",
                "files": []
            }   
        else:
            return {
                "status": "success",
                "files": files.data
            }

    except Exception as e:
        raise HTTPException(status_code=500,detail=f"Failed to get all files by workspace: {str(e)}")



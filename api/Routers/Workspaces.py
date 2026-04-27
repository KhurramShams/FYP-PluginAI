from datetime import datetime
import uuid
from fastapi import APIRouter, HTTPException,BackgroundTasks,Request, Depends
from Integrations.pinecone_client import supabase
from Utils.MainUtils.Workspace_Utils import get_workspace_by_name, get_user_owned_workspaces,create_new_workspace,validate_workspace_exists,delete_conversations_messages, get_workspace_usage
from Utils.MainUtils.User_Utils import user_exists
import re
from Services.email_service import send_workspace_create_email, send_workspace_delete_email
from Utils.RagUtils.vector_store_Utils import delete_workspace_from_pinecone,delete_user_files
from Services.activity_logger import log_workspace_create, log_workspace_update, log_workspace_delete
from Services.auth_dependency import get_current_user, verify_workspace_ownership

router = APIRouter(tags=["Workspace End-Points"])

@router.post("/create_workspace")
async def create_workspace(workspace_name: str, background_tasks: BackgroundTasks, request: Request, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["user_id"]
        # Normalize name (force lowercase)
        name = workspace_name.strip().lower()

        # Query the subscription data
        SubscriptionData = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).eq("status", "active").execute()

        # Check if there is any data
        if not SubscriptionData.data:
            raise HTTPException(status_code=404, detail="User has no active subscription")
        
        #  Validate user
        user_exists(user_id)

        # Access the first subscription record
        Subscription = SubscriptionData.data[0]

        # Now you can access subscription_id from the first record
        SubscriptionID = Subscription["subscription_id"]
        SubscriptionPackageCode =Subscription["subscription_package_code"]

        SubscriptionPackageData=supabase.table("DimSubscriptionPackages").select("*").eq("subscription_code",SubscriptionPackageCode).execute()
        SubscriptionPackageData = SubscriptionPackageData.data[0]

        # Validate workspace rules
        if len(name) < 3:
            raise HTTPException(status_code=400, detail="Workspace name must be at least 3 characters")

        if len(name) > 30:
            raise HTTPException(status_code=400, detail="Workspace name must be less than 30 characters")

        # 🔒 ONLY lowercase letters + digits allowed
        # ^[a-z0-9]+$
        if not re.match(r"^[a-z0-9]+$", name):
            raise HTTPException(
                status_code=400,
                detail="Workspace name must contain only lowercase letters and numbers (no spaces or symbols)."
            )

        # Check global uniqueness
        existing = (
            supabase.table("DimWorkSpaces")
            .select("*")
            .eq("workspace_name", name)
            .execute()
        )

        if existing.data:
            raise HTTPException(
                status_code=400,
                detail="Workspace name already exists. Please choose another one."
            )

        usage=supabase.table("FactSubscriptionUsage").select("*").eq("subscription_id",SubscriptionID).single().execute()
        usage = usage.data

        if usage["user_workspace"] >= usage["max_workspace"]:
            raise HTTPException(
                status_code=403, 
                detail="Workspace limit reached for your subscription plan."
            )
        # Save workspace
        response = await create_new_workspace(user_id, name, SubscriptionID)

        updated = supabase.table("FactSubscriptionUsage").update({"user_workspace": usage["user_workspace"] + 1}).eq("subscription_id",SubscriptionID).execute()
        if not updated.data:
            raise HTTPException(status_code=400, detail="Failed to update user usage")

        supabase.table("FactWorkSpaceUsage").insert({
        "workspace_name": name,
        "max_upload": SubscriptionPackageData["document_upload_limit"] ,
        "user_upload": 0,
        "user_api": 0, 
        "max_api": SubscriptionPackageData["api_keys_limit"],
        "user_token":0,
        "max_token": SubscriptionPackageData["max_tokens"],
        "status": "active",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        }).execute()

        user_data = supabase.table("DimUsers").select("*").eq("user_id",user_id).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="user data not found.")
        user_data = user_data.data[0]

        background_tasks.add_task(
        send_workspace_create_email,
        to_email = user_data['email'],
        workspace_name = name,
        )

        background_tasks.add_task(
        log_workspace_create,
        user_id = user_id,
        workspace_name = name,
        request = request,
        )

        return {
            "status": "success",
            "message": "Workspace created successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error During Workspace Setup: {str(e)}")

@router.get("/get_all_workspaces")
async def get_all_user_workspaces(current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["user_id"]
        workspaces = await get_user_owned_workspaces(user_id)
        return {"status": "success", "workspaces": workspaces}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during fetching user workspaces: {str(e)}")

@router.get("/get_workspace/{workspace_name}")
async def get_workspace(workspace_name: str, current_user  = Depends(get_current_user)):
    try:

        result_data = get_workspace_by_name(workspace_name)
        return {"status": "success", "Workspace Details": result_data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during fetching workspace details: {str(e)}")

@router.get("/delete_workspace/{WorkSpaceName}")
async def delete_workspace( WorkSpaceName: str, background_tasks: BackgroundTasks, request: Request, current_user  = Depends(get_current_user) ):
    try:
        await validate_workspace_exists(WorkSpaceName)

        response = await delete_workspace_from_pinecone(WorkSpaceName)
        if not response:
            print(f"Warning: Pinecone deletion failed for '{WorkSpaceName}' — continuing.")

        # Delete Data From FactWorkSpaceUsage Table
        return_data = supabase.table("FactWorkSpaceUsage").delete().eq("workspace_name", WorkSpaceName).execute()
        if not return_data.data:
            raise HTTPException(status_code=404, detail="Workspace not found.")

        # Get data to update user upload count -1
        subscription_id=supabase.table("DimWorkSpaces").select("*").eq("workspace_name",WorkSpaceName).execute()
        if not subscription_id.data:
            raise HTTPException(status_code=404, detail="DimWorkSpaces data not found.")
        subscription_id=subscription_id.data[0]

        user_id = subscription_id['user_id']
        usagedata = supabase.table("FactSubscriptionUsage").select("*").eq("subscription_id",subscription_id['subscription_id']).execute()
        
        if not usagedata.data:
            raise HTTPException(status_code=404, detail=" FactSubscriptionUsage data not found.")

        usage=usagedata.data[0]
        supabase.table("FactSubscriptionUsage").update({"user_workspace": max(0,usage["user_workspace"] - 1)}).eq("subscription_id",subscription_id['subscription_id']).execute()

        try:
            await delete_conversations_messages(WorkSpaceName)

            api_response = supabase.table("DimUserApi").delete().eq("workspace_name",WorkSpaceName).execute()
            deleted_count = len(api_response.data) if api_response.data else 0
            print(f"Deleted {deleted_count} records")

            # Delete All files from storage
            delete_file_count = await delete_user_files(user_id,WorkSpaceName)

            # Update File Count
            deleted_files     = delete_file_count["deleted_files"]

            supabase.table("FactSubscriptionUsage").update({"user_uploded_docs": max(0,usage["user_uploded_docs"] - deleted_files )}).eq("subscription_id",subscription_id['subscription_id']).execute()
            supabase.table("FactSubscriptionUsage").update({"user_api": max(0,usage["user_api"] - deleted_count )}).eq("subscription_id",subscription_id['subscription_id']).execute()

        except Exception as e:
         raise HTTPException(status_code=500, detail=f"Error during deleting workspace data from tables details: {str(e)}")
        
        # Email Setup
        user_data = supabase.table("DimUsers").select("*").eq("user_id",user_id).execute()
        if not user_data.data:
            print('Error : User data not Found for email setup.')
        user_data = user_data.data[0]

        # Delete UserDocuments
        supabase.table("DimUserDocuments").delete().eq("workspace_name",WorkSpaceName).execute()

        # Delete Work Space Activity
        supabase.table("user_activity_logs").delete().eq("workspace_name",WorkSpaceName).execute()

        # Delete Work Space from main file
        supabase.table("DimWorkSpaces").delete().eq("workspace_name",WorkSpaceName).execute()

        background_tasks.add_task(
        send_workspace_delete_email,
        to_email = user_data['email'],
        workspace_name = WorkSpaceName,
        )

        background_tasks.add_task(
        log_workspace_delete,
        user_id = user_id,
        workspace_name = WorkSpaceName,
        request = request,
        )

        return {
            "status": "success", 
            "message": f"Workspace '{WorkSpaceName}' deleted successfully."
            }

    except Exception as e:
        print(f"Delete workspace failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspace_usage/{workspace_name}")
async def get_workspace_usage_endpoint(workspace_name: str, current_user  = Depends(get_current_user)):
    try:

        result_data = await get_workspace_usage(workspace_name)
        return {"status": "success", "Workspace Usage": result_data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during fetching workspace usage: {str(e)}")

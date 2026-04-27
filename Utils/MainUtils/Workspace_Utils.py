from datetime import datetime
import uuid
from Integrations.pinecone_client import supabase
from fastapi import HTTPException 
from Utils.RagUtils.vector_store_Utils import delete_workspace_from_pinecone,delete_user_files

async def validate_workspace_exists(workspace_name: str):
    try:   
        workspace = supabase.table("DimWorkSpaces").select("*").eq("workspace_name", workspace_name).execute()
        if not workspace.data:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating workspace exists: {str(e)}")

def get_workspace_by_name(workspace_name: str):
    try:
        workspace = supabase.table("DimWorkSpaces").select("*").eq("workspace_name", workspace_name).execute()
        if not workspace.data:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return workspace.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting workspace by name: {str(e)}")

async def get_workspace_usage(workspace_name: str):
    try: 
        workspace = supabase.table("FactWorkSpaceUsage").select("*").eq("workspace_name", workspace_name).execute()
        if not workspace.data:
            raise HTTPException(status_code=404, detail="Workspace usage not found")
        return workspace.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting workspace usage: {str(e)}")

async def get_user_owned_workspaces(user_id: str):
    try:
        workspaces = supabase.table("DimWorkSpaces").select("*").eq("user_id", user_id).execute()
        if not workspaces.data:
            return []
        return workspaces.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting all user workspaces: {str(e)}")

async def create_new_workspace(user_id: str, workspace_name: str, SubscriptionID: str):
    try:
        # Save workspace
        supabase.table("DimWorkSpaces").insert({
                "user_id": user_id,
                "status" : "active",
                "workspace_name": workspace_name,
                "workspace_id": str(uuid.uuid4()),
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "subscription_id": SubscriptionID
            }).execute()
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating workspace: {str(e)}")

async def delete_conversations_messages(workspace_name: str):
    try:

        # Fetch all conversations for the workspace
        response = supabase.table("DimConversations") \
            .select("*") \
            .eq("workspace_name", workspace_name) \
            .execute()

        conversations = response.data

        if not conversations:
            print("No conversations found for this workspace")
            return True

        # Delete messages for each conversation
        for conv in conversations:
            conversation_id = conv['conversation_id']
            supabase.table("FactMessages") \
                .delete() \
                .eq("conversation_id", conversation_id) \
                .execute()

        # Delete all conversations
        supabase.table("DimConversations") \
            .delete() \
            .eq("workspace_name", workspace_name) \
            .execute()

        print(f"Deleted {len(conversations)} conversations and their messages.")

        return True

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error Deleting Conversations and Messages: {str(e)}"
        )

async def delete_workspace_completely(WorkSpaceName: str):
    try:
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
            delete_file_count = await delete_user_files(user_id, WorkSpaceName)

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

        return True

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error Deleting Conversations and Messages: {str(e)}"
        )

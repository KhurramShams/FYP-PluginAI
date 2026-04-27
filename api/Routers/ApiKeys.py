from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Depends
from Integrations.pinecone_client import supabase
from Utils.MainUtils.Api_Utils import save_api_key, get_all_api_keys,get_workspace_api_keys,delete_api_key,mask_api_key
from Utils.MainUtils.User_Utils import user_exists
from Utils.MainUtils.Workspace_Utils import validate_workspace_exists
from Utils.MainUtils.Subscription_Utils import validate_subscription_exists
from Services.activity_logger import log_api_create, log_api_delete
from Services.auth_dependency import get_current_user, verify_2fa_session


router = APIRouter(tags=["Api Keys End-Points"])

@router.get("/generate_api_key")
async def generate_api_key( request :Request, background_tasks: BackgroundTasks, workspace_name: str,current_user: dict = Depends(verify_2fa_session)):
    try:   
        user_id = current_user["user_id"]
        user_exists(user_id)
        validate_workspace_exists(workspace_name)
        validate_subscription_exists(user_id)

        usage_resp = supabase.table("FactWorkSpaceUsage").select("*").eq("workspace_name", workspace_name).execute()

        if not usage_resp.data:
            raise HTTPException(status_code=404, detail="Workspace not found, Try again")

        usage = usage_resp.data[0]
        
        max_api = usage["max_api"]
        used_api = usage["user_api"]

        if max_api and used_api >= max_api:
            raise HTTPException(status_code=403, detail="API key limit reached. Upgrade plan.")

        supabase.table("FactWorkSpaceUsage").update({"user_api": used_api + 1}).eq("workspace_name", workspace_name).execute()

        raw_key = await save_api_key(user_id, workspace_name)

        masked_key = mask_api_key(raw_key)

        # Sub Usage Update
        subscriptions_record = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).execute()
        if not subscriptions_record.data:
            raise HTTPException(
                status_code=404, 
                detail="API key not found or already inactive"
            )
        subscriptions_record = subscriptions_record.data[0]
        subscriptions_id = subscriptions_record['subscription_id'] 

        # Optional: Reduce usage tracker count
        subscriptions_usage = supabase.table("FactSubscriptionUsage").select("user_api").eq("subscription_id", subscriptions_id).single().execute()

        sub_current_count = subscriptions_usage.data.get("user_api", 0)
        sub_new_count = max(sub_current_count + 1, 0)

        supabase.table("FactSubscriptionUsage").update({"user_api": sub_new_count}).eq("subscription_id", subscriptions_id).execute()

        background_tasks.add_task(
            log_api_create,
            user_id = user_id,
            workspace_name = workspace_name,
            api_key_prefix = masked_key,
            request = request,
        )

        return {"api_key": raw_key}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generate api key : {str(e)}")

@router.get("/get_all_api")
async def get_all_api(current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["user_id"]
        user_exists(user_id)

        api_data = await get_all_api_keys(user_id)

        return {
            "api_keys": api_data,
            "count": len(api_data)
        }
 
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching api: {str(e)}")


@router.get("/get_workspace_api/{workspace_name}")
async def get_workspace_api(workspace_name: str, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["user_id"]
        user_exists(user_id)

        # 2. Get active API keys
        api_data= await get_workspace_api_keys(user_id,workspace_name)

        return {
            "api_keys": api_data,
            "count": len(api_data)
        }
 
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching api: {str(e)}")

@router.get("/delete_api_key")
async def delete_api(request: Request, background_tasks: BackgroundTasks, api_key: str, current_user: dict = Depends(verify_2fa_session)):
    try:
        user_id = current_user["user_id"]
        user_exists(user_id)

        # Check key belongs to user
        api_record = supabase.table("DimUserApi").select("*").eq("user_id", user_id).eq("api_key", api_key).execute()

        if not api_record.data:
            raise HTTPException(
                status_code=404, 
                detail="API key not found or already inactive"
            )
        api_record = api_record.data[0]
        print(api_record)
        workspace_name=api_record["workspace_name"]

        await delete_api_key(user_id,api_key)
        
        # Optional: Reduce usage tracker count
        usage = supabase.table("FactWorkSpaceUsage").select("user_api").eq("workspace_name", workspace_name).single().execute()

        current_count = usage.data.get("user_api", 0)
        new_count = max(current_count - 1, 0)

        supabase.table("FactWorkSpaceUsage").update({"user_api": new_count}).eq("workspace_name", workspace_name).execute()

        subscriptions_record = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).execute()
        if not subscriptions_record.data:
            raise HTTPException(
                status_code=404, 
                detail="API key not found or already inactive"
            )
        subscriptions_record = subscriptions_record.data[0]
        subscriptions_id = subscriptions_record['subscription_id'] 

        # Optional: Reduce usage tracker count
        subscriptions_usage = supabase.table("FactSubscriptionUsage").select("user_api").eq("subscription_id", subscriptions_id).single().execute()

        sub_current_count = subscriptions_usage.data.get("user_api", 0)
        sub_new_count = max(sub_current_count - 1, 0)

        supabase.table("FactSubscriptionUsage").update({"user_api": sub_new_count}).eq("subscription_id", subscriptions_id).execute()

        masked_key = mask_api_key(api_key)

        background_tasks.add_task(
        log_api_delete,
        user_id = user_id,
        workspace_name = workspace_name,
        api_key_prefix = masked_key,
        request = request,
        )
        
        return {"message": "API key deleted successfully"}

    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error deleting API key: {str(e)}"
        )



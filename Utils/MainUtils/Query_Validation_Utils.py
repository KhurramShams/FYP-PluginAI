from fastapi import HTTPException
from Integrations.pinecone_client import supabase  

async def validate_workspace_exists(workspace_name: str):
    try:   
        workspace = supabase.table("DimWorkSpaces").select("*").eq("workspace_name", workspace_name).execute()
        if not workspace.data:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating workspace exists: {str(e)}")
 
async def check_token_usage(workspace_name: str):
    try:
        token_usage_resp = supabase.table("FactWorkSpaceUsage").select("*").eq("workspace_name", workspace_name).single().execute()
        if not token_usage_resp.data:
            raise HTTPException(status_code=404, detail="Workspace token usage data not found")

        token_usage = token_usage_resp.data

        user_token = token_usage.get("user_token")
        max_token = token_usage.get("max_token")

        if user_token is None or max_token is None:
            pass
        else:
            user_token = int(user_token)
            max_token = int(max_token)
            if user_token > max_token:
                raise HTTPException(status_code=403, detail="Token limit reached for this workspace.")
        return True
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check token usage: {str(e)}")

async def validate_api_key(workspace_name: str, api_key: str):
    try:   
        api_data_response = supabase.table("DimUserApi").select("*").eq("workspace_name", workspace_name).eq("api_key", api_key).eq("status", "active").execute()
        if not api_data_response.data:
            raise HTTPException(status_code=403, detail="API key invalid or inactive for this workspace")
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating workspace exists: {str(e)}")
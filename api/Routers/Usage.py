from fastapi import APIRouter, HTTPException, BackgroundTasks
from Integrations.pinecone_client import supabase
from Utils.MainUtils.Workspace_Utils import validate_workspace_exists


router=APIRouter(tags=["Usage End-Points"])

@router.post("/api_usage")
async def query_file(api_key: str, workspace : str):
    try:
        await validate_workspace_exists(workspace)

        # Fetch FactMessages data
        messages = supabase.table("FactMessages").select("prompt_tokens, completion_tokens, latency_ms").eq("api_key", api_key).execute()

        data = messages.data or []

        # Initialize values
        total_prompt_tokens = 0
        total_completion_tokens = 0
        latency_list = []

        for row in data:
            total_prompt_tokens += row.get("prompt_tokens") or 0
            total_completion_tokens += row.get("completion_tokens") or 0

            latency = row.get("latency_ms")
            if latency:
                try:
                    latency_list.append(float(latency))
                except:
                    pass

        avg_latency = sum(latency_list) / len(latency_list) if latency_list else 0

        # Fetch workspace usage
        workspace = supabase.table("FactWorkSpaceUsage").select("user_token, max_token").eq("workspace_name", workspace).limit(1).execute()

        workspace_data = workspace.data[0] if workspace.data else {}

        return {
            "status": "success",
            "api_usage_data": {
                "avg_latency_ms": round(avg_latency, 2),
                "total_prompt_tokens": total_prompt_tokens,
                "total_completion_tokens": total_completion_tokens,
                "user_token": workspace_data.get("user_token", 0),
                "max_token": workspace_data.get("max_token", 0)
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query api usage: {str(e)}")


from fastapi import APIRouter, HTTPException
from Integrations.pinecone_client import supabase
from Utils.MainUtils.Workspace_Utils import validate_workspace_exists

router=APIRouter(tags=["Messages End-Points"])

@router.get("/conversations")
async def get_conversations(workspace: str):
    try:
        result = supabase.table("DimConversations").select("conversation_id, workspace_name, source_type, api_key_id, created_at").eq("workspace_name", workspace).order("created_at", desc=True).execute()

        return {
            "status": "success",
            "conversations": result.data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch conversations: {str(e)}")

@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str):
    try:
        result = supabase.table("FactMessages").select("message_id, role, content, prompt_tokens, completion_tokens, latency_ms, last_used").eq("conversation_id", conversation_id).order("message_id").execute()

        return {
            "status": "success",
            "conversation_id": conversation_id,
            "messages": result.data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch messages: {str(e)}")


@router.get("/conversations/{conversation_id}/stats")
async def get_conversation_stats(conversation_id: str):
    try:
        result = supabase.table("FactMessages").select("prompt_tokens, completion_tokens, latency_ms").eq("conversation_id", conversation_id).execute()


        data = result.data or []

        total_messages = len(data)
        total_prompt_tokens = 0
        total_completion_tokens = 0
        latency_values = []

        for row in data:
            total_prompt_tokens += row.get("prompt_tokens") or 0
            total_completion_tokens += row.get("completion_tokens") or 0

            latency = row.get("latency_ms")
            if latency:
                try:
                    latency_values.append(float(latency))
                except:
                    pass

        avg_latency = sum(latency_values) / len(latency_values) if latency_values else 0

        return {
            "status": "success",
            "conversation_id": conversation_id,
            "stats": {
                "total_messages": total_messages,
                "total_prompt_tokens": total_prompt_tokens,
                "total_completion_tokens": total_completion_tokens,
                "avg_latency_ms": round(avg_latency, 2)
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch conversation stats: {str(e)}")


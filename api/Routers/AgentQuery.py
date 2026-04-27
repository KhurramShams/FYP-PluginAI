from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from Services.AgenticRag.agent import run_agent
from Services.activity_logger import log_activity
from Utils.MainUtils.Query_Validation_Utils import check_token_usage,validate_api_key
from Integrations.pinecone_client import supabase
import asyncio, time

router = APIRouter(prefix="/agent", tags=["Agentic RAG"])


class AgentQueryRequest(BaseModel):
    query:          str
    workspace_name: str
    Api_key:        str
    unique_id:      str
    include_steps:  bool = False   # set True to see which tools were called


async def get_conversation_history(
    conversation_id: str,
    max_turns: int = 6
) -> List[Dict]:
    """Fetch last N conversation turns from Supabase."""
    try:
        result = supabase.table("DimConversations") \
            .select("role, content") \
            .eq("conversation_id", conversation_id) \
            .order("created_at", desc=True) \
            .limit(max_turns) \
            .execute()

        if not result.data:
            return []

        return list(reversed(result.data))

    except Exception:
        return []


@router.post("/query")
async def agent_query(
    request:          AgentQueryRequest,
    background_tasks: BackgroundTasks,
):
    try:
        start_time = time.perf_counter()

        # ── Validate API key + token usage in parallel ────────────────────────
        await asyncio.gather(
            validate_api_key(request.workspace_name, request.Api_key),
            check_token_usage(request.workspace_name)
        )

        # ── Fetch conversation history ─────────────────────────────────────────
        history = await get_conversation_history(request.unique_id)

        # ── Run agent ─────────────────────────────────────────────────────────
        result = await run_agent(
            query                = request.query,
            workspace_name       = request.workspace_name,
            conversation_history = history,
        )

        response_time = time.perf_counter() - start_time

        # ── Log activity in background ────────────────────────────────────────
        background_tasks.add_task(
            log_activity,
            user_id        = request.Api_key,
            event_category = "agent",
            event_type     = "agent_query",
            description    = f"Agent query: {request.query[:80]}",
            workspace_name = request.workspace_name,
            metadata       = {
                "tools_used":   [t["tool"] for t in result["tools_used"]],
                "tool_count":   len(result["tools_used"]),
                "response_time": response_time,
            }
        )

        # ── Build response ────────────────────────────────────────────────────
        response = {
            "answer":               result["answer"],
            "status":               result["status"],
            "response_time_seconds": round(response_time, 3),
        }

        # Optionally expose tool calls (useful for debugging/UI)
        if request.include_steps:
            response["tools_used"] = result["tools_used"]

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Agent query failed: {str(e)}"
        )
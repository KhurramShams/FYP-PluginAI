import time
from fastapi import APIRouter, HTTPException, BackgroundTasks
from Schemas.querySchemas import ApiKeyQueryRequest
from Utils.MainUtils.Query_Validation_Utils import check_token_usage,validate_workspace_exists,validate_api_key
from Utils.QueryUtils.ApiQuery_Utils import generate_answer,retrieve_context
from Services.conversation_service import save_conversation_data_main
import asyncio

from Services.conversation_cache import (
    get_conversation_history,
    append_messages
)
from Services.embedding_cache import get_cached_embedding, set_cached_embedding

router=APIRouter(tags=["Api Query End-Points"])
 
@router.post("/user_api_query")
async def handle_user_query(request: ApiKeyQueryRequest , background_tasks : BackgroundTasks): 
    try:

        query = request.query
        workspace_name = request.workspace_name
        conversation_id = request.unique_id
        SystemRole='system'
        UserRole='user'

        start_time = time.perf_counter()

        await asyncio.gather(
            validate_api_key(request.workspace_name, request.Api_key),
            check_token_usage(request.workspace_name)
        )
        t1 = time.perf_counter()

        # chunks  = await retrieve_context(request.query, request.workspace_name) 
        history, chunks = await asyncio.gather(
            get_conversation_history(request.unique_id),  # Redis ~1ms
            retrieve_context(request.query, request.workspace_name),    # Pinecone ~1-2s
        )
        t2 = time.perf_counter()

        print(f"History messages loaded: {len(history)}")

        # result = await generate_answer(request.query, chunks)
        result = await generate_answer(
            query                = request.query,
            chunks               = chunks,
            conversation_history = history,
            workspace_name       = workspace_name,
        )
        t3 = time.perf_counter()

        response_time = time.perf_counter() - start_time

        print(f"Validation:  {t1 - start_time:.3f}s")
        print(f"History+RAG: {t2 - t1:.3f}s")
        print(f"LLM:         {t3 - t2:.3f}s")
        print(f"Total:       {response_time:.3f}s")

        if result.get("no_data"):
            return {
                    "respons":              result["answer"],
                    "status":               "no_data",
                    "response_time_seconds": round(response_time, 3)
            }

        prompt_tokens = result["prompt_tokens"]
        completion_tokens = result["completion_tokens"]

                # ── Update Redis conversation cache immediately ────────────────────────
        await append_messages(
            conversation_id = request.unique_id,
            user_message    = query,
            ai_response     = result["answer"],
        )


        # Background logging
        background_tasks.add_task(
        save_conversation_data_main,
        conversation_id,
        workspace_name,
        request.Api_key,
        result,
        query,
        UserRole,
        SystemRole,
        response_time,
        prompt_tokens,  
        completion_tokens,
            )

        return {
            "respons": result["answer"],
            "status": "success",
            "response_time_seconds": round(response_time, 3)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500,detail=f"Failed to query file: {str(e)}")
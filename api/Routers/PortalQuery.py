import time
from fastapi import APIRouter, HTTPException, BackgroundTasks
from Schemas.querySchemas import PortalQueryRequest
from Utils.MainUtils.Query_Validation_Utils import check_token_usage,validate_workspace_exists
from Utils.QueryUtils.ApiQuery_Utils import generate_answer,retrieve_context
from Services.conversation_service import save_conversation_data_main

router=APIRouter(tags=["Query End-Points"])

@router.post("/portal_query")
async def query_file(request: PortalQueryRequest, background_tasks: BackgroundTasks):
    try:
        query = request.query
        workspace_name = request.workspace_name
        conversation_id = request.unique_id
        SystemRole='system'
        UserRole='user'
        api_key_id=None

        start_time = time.perf_counter()
        await validate_workspace_exists(request.workspace_name)
        t1 = time.perf_counter()
        await check_token_usage(request.workspace_name)
        t2 = time.perf_counter()
        chunks  = await retrieve_context(request.query, request.workspace_name) 
        t3 = time.perf_counter()
        result = await generate_answer(request.query, chunks)
        t4 = time.perf_counter()
 
        end_time = time.perf_counter()
        response_time = end_time - start_time

        print("Token check:", t2 - t1)
        print("Retrieval:", t3 - t2)
        print("LLM:", t4 - t3)
        print("Response Time:",response_time)

        if result.get("no_data"):
            return {
                    "respons":              result["answer"],
                    "status":               "no_data",
                    "response_time_seconds": round(response_time, 3)
            }

        prompt_tokens = result["prompt_tokens"]
        completion_tokens = result["completion_tokens"]

        # Background logging
        background_tasks.add_task(
        save_conversation_data_main,
        conversation_id,
        workspace_name,
        api_key_id,
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
    except Exception as e:
        raise HTTPException(status_code=500,detail=f"Failed to query file: {str(e)}")
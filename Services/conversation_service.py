from fastapi import HTTPException
from Integrations.pinecone_client import supabase
from datetime import datetime

current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def save_conversation_data_main(conversation_id: str, workspace_name: str, api_key: str, answer: str, query: str, UserRole: str, SystemRole: str, latency_ms: str, prompt_tokens: int | None = None, completion_tokens: int | None = None, source_type: str | None = None):
    save_conversation_data(
        conversation_id, 
        workspace_name, 
        api_key,
        source_type
    )
    save_user_query(
        conversation_id,
        query,
        UserRole,
        latency_ms
        )
    save_system_and_usage(
        conversation_id,
        answer,
        SystemRole,
        latency_ms,
        prompt_tokens,
        completion_tokens
        )
    update_usage_data(
        workspace_name,
        prompt_tokens,
        completion_tokens
    )

def save_system_and_usage(conversation_id: str,answer: str,role: str, latency_ms: str, prompt_tokens: int | None = None,completion_tokens: int | None = None):
    try:
        if role =='system':
            supabase.table("FactMessages").insert({
                "conversation_id": conversation_id,
                "role": "system",
                "content": answer,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "latency_ms" : latency_ms
            }).execute()
        else: 
            print("Background Service Error.")


        print("System Message Save...!")
    except Exception as e:
        print("Background logging failed:", e)

def save_user_query(conversation_id: str, query: str, role: str, latency_ms: str):
    try:
        if role =='user':
            supabase.table("FactMessages").insert({
                "conversation_id": conversation_id,
                "role": "user",
                "content": query,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "latency_ms" : latency_ms
            }).execute()
        else: 
            print("Background Service Error.")
        print("User Message Save...!")
    except Exception as e:
        print("Background logging failed:", e)

def save_conversation_data(conversation_id: str, workspace_name: str, api_key: str, source_type: str | None = None):
    try:
        source_type = "api-call" if api_key else "direct-call"
        response = supabase.table("DimConversations").select("*").eq('conversation_id',conversation_id).execute()
        if not response.data:
            supabase.table("DimConversations").insert({
                'conversation_id':conversation_id,
                'workspace_name':workspace_name,
                'source_type':source_type,
                'api_key_id': api_key
            }).execute()
            print("Conversation saved!")
        else:
            pass
    except Exception as e:
        print("Background logging failed:", e)

def update_usage_data(workspace_name: str, prompt_tokens: int | None = None, completion_tokens: int | None = None):
    try:
        prompt_tokens = prompt_tokens or 0
        completion_tokens =completion_tokens or 0
        new_tokens = prompt_tokens + completion_tokens

        workspace_usage = supabase.table("FactWorkSpaceUsage").select("*").eq("workspace_name",workspace_name).execute()
        workspace_usage  = workspace_usage.data[0]

        DimWorkSpaces = supabase.table("DimWorkSpaces").select("*").eq("workspace_name",workspace_name).execute()
        DimWorkSpaces  = DimWorkSpaces.data[0]

        FactSubscriptionUsage = supabase.table("FactSubscriptionUsage").select("*").eq("subscription_id", DimWorkSpaces ["subscription_id"]).execute()
        FactSubscriptionUsage  = FactSubscriptionUsage.data[0]                                                                                             

        if not workspace_usage:
            raise Exception("Workspace usage record not found")
        
        # Workspace Usage Update
        current_tokens = workspace_usage["user_token"] or 0
        max_token = workspace_usage["max_token"] or 0
        updated_tokens = current_tokens + new_tokens
        
        # Subscription Usage Update
        Subscription_old_tokens = FactSubscriptionUsage["user_token"] or 0
        Subscription_updated_tokens = Subscription_old_tokens + new_tokens

        Subscription_old_api_calls = FactSubscriptionUsage["user_query"] or 0
        Subscription_updated_api_calls = 1 + Subscription_old_api_calls

        update_response = supabase.table("FactWorkSpaceUsage").update({
                "user_token": updated_tokens,
                "updated_at": datetime.utcnow().isoformat()
        }).eq("workspace_name",workspace_name).execute()

        Subscription_update_response = supabase.table("FactSubscriptionUsage").update({
                "user_token": Subscription_updated_tokens,
                "user_query": Subscription_updated_api_calls,
        }).eq("subscription_id", DimWorkSpaces ["subscription_id"]).execute()

        if not update_response.data:
            raise Exception("Failed to update token usage")

    except Exception as e:
        print("Background logging failed:", e)
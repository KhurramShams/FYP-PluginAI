from Integrations.pinecone_client import supabase
from fastapi import HTTPException

def user_exists(user_id: str):
    user = supabase.table("DimUsers").select("*").eq("user_id", user_id).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="User not found")
    return True
from Integrations.pinecone_client import supabase
from fastapi import HTTPException

def validate_subscription_exists(user_id: str):
    try:
        subscription = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).eq("status", "active").execute()
        if not subscription.data:
            raise HTTPException(status_code=404, detail="No active subscription.")
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating subscription exists: {str(e)}")
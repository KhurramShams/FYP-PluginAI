from datetime import datetime
import secrets
import hashlib
from fastapi import HTTPException
from Integrations.pinecone_client import supabase

def generate():
    raw_key = "rag_sk_" + secrets.token_hex(16)
    hashed = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, hashed

def parse_limit(value):
    return None if str(value).lower() == "unlimited" else int(value)

def normalize_limit(value, default_unlimited=5_000_000):
    if isinstance(value, str) and value.strip().lower() == "unlimited":
        return default_unlimited
    if value is None:
        return 0
    return int(value)

async def verify_api_key(api_key: str):

    try:
        # Check API key record
        api_resp = supabase.table("user_api").select("user_id, status").eq("key", api_key).single().execute()

        key_data = api_resp.data

        if not key_data:
            raise HTTPException(status_code=401, detail="Invalid API Key")

        if key_data["status"] != "active":
            raise HTTPException(status_code=403, detail="API Key is already inactive")

        # Key is valid
        return key_data["user_id"]

    except Exception:
        # Covers cases like .single() failing
        raise HTTPException(status_code=401, detail="Invalid or expired API Key")

async def save_api_key(user_id: str, workspace_name: str):

    try:
        raw_key, hashed_key = generate()

        supabase.table("DimUserApi").insert({
        "user_id": user_id,
        "api_key": raw_key,
        "status": "active",
        "workspace_name": workspace_name,
        "created_at": datetime.utcnow().isoformat(),
        "last_used_at":datetime.utcnow().isoformat(),
        }).execute()

        return raw_key

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving api key: {str(e)}")

async def get_all_api_keys(user_id: str):
    try:
        api_keys = supabase.table("DimUserApi").select("api_key, workspace_name, status, last_used_at, created_at").eq("user_id", user_id).eq("status", "active").execute()
        return api_keys.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting all api keys: {str(e)}")

async def get_workspace_api_keys(user_id: str, workspace_name: str):
    try:
        api_keys = supabase.table("DimUserApi").select("api_key, workspace_name, status, last_used_at").eq("user_id", user_id).eq("workspace_name", workspace_name).eq("status", "active").execute()
        if not api_keys.data:
            raise HTTPException(status_code=404, detail="No active API keys found.")
        return api_keys.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting workspace api keys: {str(e)}")

async def delete_api_key(user_id:str, api_key: str):
    try:
        # Disable the key
        data = supabase.table("DimUserApi").delete().eq("user_id", user_id).eq("api_key", api_key).execute()
        if not data.data:
            raise HTTPException(status_code=404, detail="No active API keys found.")
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error Deleteing api key: {str(e)}")

def mask_api_key(api_key: str) -> str:
    if len(api_key) <= 10:
        return api_key
    return f"{api_key[:10]}.........................{api_key[-4:]}"
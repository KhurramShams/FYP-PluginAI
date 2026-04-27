from uuid import UUID
from fastapi import HTTPException
from Integrations.pinecone_client import supabase

# Example of inserting a new user
async def insert_user(user_data):
    try:
        response = supabase.table("DimUsers").insert(user_data).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inserting user: {str(e)}")


async def update_user(user_id: UUID, user_data: dict):
    try:
        # Ensure that updated_at is converted to string if it exists in user_data
        if "updated_at" in user_data:
            user_data["updated_at"] = user_data["updated_at"].isoformat()  # Convert datetime to string format
        
        # Update the user data in the database, only passing the fields that are provided
        response = supabase.table("DimUsers").update(user_data).eq("user_id", user_id).execute()

        return response.data  # Return the updated user data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user: {str(e)}")
from uuid import UUID
import uuid
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from Schemas.schemas import UserCreate,UserRead,UserUpdate
from Integrations.pinecone_client import supabase
from DataBase.user_crud import insert_user,update_user
from Services.auth_dependency import get_current_user, verify_2fa_session

# Router
router = APIRouter(tags=["Users End-Points"])

@router.get("/get")
async def get_user_details(user_id:UUID, response_model=None, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["user_id"]
        user_data = supabase.table("DimUsers").select("*").eq("user_id", user_id).execute()
        if user_data is None:
            raise HTTPException(status_code=404, detail="No users found")
        return user_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching users: {str(e)}")

@router.post("/add")
async def register(user: UserCreate, current_user  = Depends(get_current_user)):

    print("Add User")
    # Check if user already exists
    email_response = supabase.table("DimUsers").select("*").eq("email", user.email).execute()

    if email_response.data:
            raise HTTPException(status_code=400, detail="User with this email already exists.")

    user_data = user.dict()
    user_data["user_id"] = str(user.user_id)  # Convert UUID to string
    try:
        response = await insert_user(user_data)

        return {"status": "success", "message": "User Added successfully."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating user: {str(e)}")

@router.post("/update/{user_id}")
async def update_user_endpoint(user_id: UUID, Users: UserUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    # Convert the Pydantic model to a dictionary and exclude unset fields
    user_data = Users.dict(exclude_unset=True)  # Only include the fields that were provided by the user

    # Remove any fields that are explicitly set to None (if you don't want to update them)
    user_data = {key: value for key, value in user_data.items() if value is not None}

    try:
        # Only pass the fields that are not None for the update operation
        response = await update_user(user_id, user_data)
        return JSONResponse({
            "status": "success",
            "message": "User updated successfully",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user: {str(e)}")

@router.post("/delete/{user_id}")
async def delete_user(user_id: UUID, current_user: dict = Depends(verify_2fa_session)):
    try:
        user_id = current_user["user_id"]
        # Perform the delete operation
        response = supabase.table("DimUsers").delete().eq("user_id", user_id).execute()

        # Check if the delete operation was successful by checking if any data was returned
        if response.data:  # If there's data in the response, deletion was successful
            return {"status": "success", "message": "User deleted successfully"}
        else:
            # If no data is returned, the user was not found or deletion failed
            raise HTTPException(status_code=404, detail="User not found or deletion failed.")

    except Exception as e:
        # Handle errors that occur during the delete operation
        raise HTTPException(status_code=500, detail=f"Error deleting user: {str(e)}")

@router.post("/password_reset/{user_id}")
async def send_password_reset_email(user_id: UUID, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["user_id"]
        # Retrieve the user data from the users table based on login_id
        response = supabase.table("DimUsers").select("email").eq("user_id", user_id).execute()

        # Check if the user exists in the users table
        if len(response.data) == 0:
            raise HTTPException(status_code=404, detail="User not found with the provided login ID.")

        # Get the user's email from the response
        user_email = response.data[0]['email']

        # Send a password reset email to the user using Supabase Auth API
        reset_response = supabase.auth.reset_password_for_email(user_email)

        # Check if the password reset request was successful
        if reset_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to send password reset email.")

        return {"status": "success", "message": "Password reset email sent successfully."}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

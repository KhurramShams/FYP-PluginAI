from uuid import UUID
from pydantic import BaseModel, EmailStr, constr, validator
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    username: str
    password: str
    email: EmailStr
    full_name: str
    role: Optional[constr(max_length=50)] = 'Freelancer'  # Default to Freelancer
    company_name: Optional[str] = None
    phone_number: Optional[str] = None
    subscription_plan: Optional[str] = None
    profile_picture_url: Optional[str] = None
    terms_accepted: Optional[bool] = False  # Default to False

class UserLogin(BaseModel):
    email: EmailStr
    password: str

    class Config:
        from_attributes = True

class AdminLogin(BaseModel):
    email: EmailStr
    password: str
    admin_api_key: str

class GoogleSignInRequest(BaseModel):
    id_token: str

class UserCreate(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str
    role: Optional[constr(max_length=50)] = 'Freelancer'  # Default to Freelancer
    company_name: Optional[str] = None
    phone_number: Optional[str] = None
    subscription_plan: Optional[str] = None
    profile_picture_url: Optional[str] = None
    terms_accepted: Optional[bool] = False  # Default to False

    class Config:
        from_attributes = True

class UserRead(BaseModel):
    user_id: int
    login_id: Optional[str]
    email: EmailStr
    full_name: str
    role: str
    company_name: Optional[str] = None
    phone_number: Optional[str] = None
    subscription_plan: Optional[str] = None
    profile_picture_url: Optional[str] = None
    terms_accepted: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    company_name: Optional[str] = None
    phone_number: Optional[str] = None
    subscription_plan: Optional[str] = None
    profile_picture_url: Optional[str] = None
    terms_accepted: Optional[bool] = None
    updated_at: Optional[datetime] = None  # Make this optional

    @validator("updated_at", pre=True)
    def convert_datetime_to_string(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()  # Convert datetime to ISO string format
        return v

    class Config:
        from_attributes = True

class resetpasswordemail(BaseModel):
    email: EmailStr
    user_id: str

class UserQueryInput(BaseModel):
    workspace_id:str
    query: str
    session_id: str
from pydantic import BaseModel

class OTPVerifyRequest(BaseModel):
    user_id: str
    otp:     str

class OTPResendRequest(BaseModel):
    user_id: str
    email:   str

class Toggle2FARequest(BaseModel):
    user_id:  str
    password: str 
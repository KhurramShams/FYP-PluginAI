# Api/Routers/Admin.py
from fastapi import APIRouter, Depends, HTTPException
from Services.usage_email import run_monthly_usage_emails,send_usage_email_to_user

router = APIRouter(prefix="/send_usage_email", tags=["BcServices"])

@router.post("/send_usage_emails")
async def trigger_usage_emails():
    """
    Manually trigger monthly usage emails.
    Useful for testing or re-sending.
    """
    summary = await run_monthly_usage_emails()
    return {
        "status":  "complete",
        "summary": summary
    }

@router.post("/send_usage_email_to_user")
async def trigger_usage_email_to_user(email : str):

    result = await send_usage_email_to_user(email)
    
    if result["status"] == "failed":
        raise HTTPException(status_code=404, detail=result["reason"])
    return result
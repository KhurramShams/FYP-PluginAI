from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Depends
from fastapi.responses import JSONResponse
from Schemas.schemas import UserLogin, UserRegister, resetpasswordemail, AdminLogin
import os
from dotenv import load_dotenv
from Integrations.pinecone_client import supabase
from fastapi import BackgroundTasks, HTTPException
from Services.email_service import send_login_alert_email
from Services.activity_logger import log_logout ,log_password_change,log_login
import os, logging, httpx
from fastapi.responses import RedirectResponse, JSONResponse
from Services.activity_logger import log_login
from pydantic import BaseModel
from typing import Optional
from Services.auth_dependency import get_current_user
from Services.two_fa_service import (
    send_otp, verify_otp, enable_2fa,
    disable_2fa, is_2fa_enabled_for_user, is_2fa_verified
)
from Schemas.TwoFaSchemas import OTPVerifyRequest, OTPResendRequest, Toggle2FARequest
from Services.rate_limiter import check_admin_auth_rate_limit
from Services.admin_service import audit_log


logger = logging.getLogger(__name__)
# Load Keys
load_dotenv()


FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pluginai.space/")
BACKEND_URL  = os.getenv("BACKEND_URL",  "http://localhost:8000")

# Router
router = APIRouter(tags=["Login End-Points"])

# ------------------- Register User -------------------
@router.post("/sign_up")
async def sign_up(request: UserRegister):
    # Check if any of the fields are empty
    if not request.username or not request.password or not request.email or not request.phone_number:
        raise HTTPException(status_code=400, detail="All fields are required")

    # Check if the password length is sufficient
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    # Check if the phone number format is valid (example: basic phone length check, you can modify this as per your requirement)
    if len(request.phone_number) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number. Ensure it is at least 10 digits long")

    try:
        # Sign up the user using Supabase
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "data": {
                "username": request.username,
                "phone" : request.phone_number,
            }
        })

    except Exception as e:
        # If there's an issue with the Supabase request, return a generic error
        raise HTTPException(status_code=500, detail=f"Supabase error: {str(e)}")

    if not response.user:
        raise HTTPException(status_code=400, detail="Sign-up failed. Please check your credentials or try again later.")

    # Get the Auth ID (user ID)
    user_id = response.user.id

    if not user_id:
        raise HTTPException(status_code=401, detail="Sign-in failed. Please check your credentials or try again.")

    try:
        # ---------------- Insert into DimUsers ----------------
        supabase.table("DimUsers").insert({
            "user_id": user_id,
            "email": request.email,
            "full_name": request.username,
            "role" : request.role,
            "company_name": request.company_name,
            "phone_number": request.phone_number,
            "subscription_plan": None,
            "profile_picture_url": '#',
            "terms_accepted" : True,
        }).execute()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"User table insert failed: {str(e)}")
    
        # Send the welcome email in the background
    # background_tasks.add_task(send_welcome_email, request.email)
 
    # ------------------- Return User Auth ID -------------------
    return JSONResponse({
        "status": "success",
        "message": "User registered successfully. Use this ID for further data operations.",
        "user_id": user_id,
    })

# ------------------- Login User -------------------
@router.post("/sign_in")
async def sign_in(request: UserLogin, background_tasks: BackgroundTasks, Requests: Request):

    # Check if the email or password is empty
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    # Attempt to sign in with Supabase
    try:
        response = supabase.auth.sign_in_with_password({"email": request.email, "password": request.password})

        background_tasks.add_task(
        log_login,
        user_id = None,
        email = request.email,
        status = "success",
        request  = Requests
        )

    except Exception as e:
        background_tasks.add_task(
        log_login,
        user_id = None,
        email = request.email,
        status = "failed",
        request  = Requests
        )
        # If there's an issue with Supabase request, handle the error
        raise HTTPException(status_code=500, detail=f"Supabase error: {str(e)}")
    
    if not response.user:
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    
    background_tasks.add_task(
        send_login_alert_email,
        to_email = request.email
    )

    if not response.user:
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    
    user_id      = response.user.id
    access_token = response.session.access_token

    if is_2fa_enabled_for_user(user_id):

        # Fetch user profile for name
        user_data = supabase.table("DimUsers") \
            .select("full_name, email") \
            .eq("user_id", user_id) \
            .execute()

        full_name = user_data.data[0]["full_name"] if user_data.data else "User"

        # Send OTP
        otp_result = await send_otp(
            user_id   = user_id,
            email     = request.email,
            full_name = full_name
        )

        if otp_result["status"] != "sent":
            raise HTTPException(
                status_code=500,
                detail=otp_result.get("message", "Failed to send OTP.")
            )

        # Return partial auth — frontend must verify OTP next
        return {
            "status":       "2fa_required",
            "user_id":      user_id,
            "message":      otp_result["message"],
            "expires_in":   otp_result["expires_in"],
        }

    # ── No 2FA — normal login ─────────────────────────────────────────────────

    background_tasks.add_task(
        log_login,
        user_id = user_id,
        email   = request.email,
        status  = "success",
        request = Requests
    )
    background_tasks.add_task(
        send_login_alert_email,
        to_email = request.email
    )

    return {
        "status":       "success",
        "access_token": access_token,
    }


# ------------------- Admin Target Authentication -------------------
@router.post("/admin/sign_in")
async def admin_sign_in(request: AdminLogin, background_tasks: BackgroundTasks, raw_request: Request):
    """Deeply secure Admin-only Authentication Gateway."""
    
    # 1. IP Filtering (Silent bypass if empty env variable)
    allowed_ips_str = os.getenv("ADMIN_ALLOWED_IPS", "").strip()
    client_ip = raw_request.client.host if raw_request.client else "unknown"
    if allowed_ips_str:
        allowed_ips = [ip.strip() for ip in allowed_ips_str.split(",")]
        if client_ip not in allowed_ips:
            logger.warning(f"Admin login blocked: Unauthorized IP {client_ip}")
            raise HTTPException(status_code=403, detail="Unauthorized client IP network.")

    # 2. Rate Limiting Check (5 attempts / 10 mins)
    await check_admin_auth_rate_limit(raw_request)

    # 3. Admin API Key Hardware Gate
    env_admin_key = os.getenv("ADMIN_API_KEY")
    if not env_admin_key or request.admin_api_key != env_admin_key:
        background_tasks.add_task(
            audit_log, action="admin_login_failed", description="Invalid ADMIN_API_KEY signature", 
            request=raw_request, metadata={"email": request.email}
        )
        raise HTTPException(status_code=403, detail="Invalid administration key payload.")

    # 4. Supabase Credentials Match
    try:
        response = supabase.auth.sign_in_with_password({"email": request.email, "password": request.password})
    except Exception as e:
        background_tasks.add_task(
            audit_log, action="admin_login_failed", description=f"Supabase error: {str(e)}", 
            request=raw_request, metadata={"email": request.email}
        )
        raise HTTPException(status_code=401, detail="Invalid administrative credentials.")

    if not response.user:
        raise HTTPException(status_code=401, detail="Invalid administrative credentials.")
    
    user_id = response.user.id

    # 5. Role Interrogation
    user_data = supabase.table("DimUsers").select("full_name, role").eq("user_id", user_id).execute()
    if not user_data.data or user_data.data[0].get("role") != "admin":
        background_tasks.add_task(
            audit_log, action="admin_login_blocked", description=f"Standard user attempted gateway via valid keys", 
            request=raw_request, metadata={"user_id": user_id, "email": request.email}
        )
        raise HTTPException(status_code=403, detail="Account lacks administrative authorization flag.")

    full_name = user_data.data[0]["full_name"]

    # 6. Strict Mandatory 2FA Check Bypass Trigger
    otp_result = await send_otp(
        user_id   = user_id,
        email     = request.email,
        full_name = full_name
    )

    if otp_result["status"] != "sent":
        raise HTTPException(status_code=500, detail="Failed to fire administrative 2FA payload.")

    # Force OTP verification mechanism inside frontend.
    return {
        "status":       "2fa_required",
        "user_id":      user_id,
        "message":      "Administrative protocol demands OTP loop verification.",
        "expires_in":   otp_result["expires_in"],
    }

    # ------------------- Logout User -------------------
@router.post("/sign_out")
async def sign_out(user_id: str ,email : str ,background_tasks: BackgroundTasks, Requests: Request, current_user  = Depends(get_current_user)):
    try:
        supabase.auth.sign_out()

        background_tasks.add_task(
        log_logout,
        user_id = user_id,
        email   = email,
        request  = Requests
        )
         
        return {"message": "Signed out successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error signing out: {str(e)}")

# ------------------- Send Password Reset Email -------------------
@router.post("/password_resetl")
async def send_password_reset_email(request: resetpasswordemail, background_tasks: BackgroundTasks):
    try:

        # Send a password reset email to the user
        supabase.auth.reset_password_for_email(request.email)

        background_tasks.add_task(
        log_password_change,
        user_id = request.user_id,
        email   = request.email,
        request  = Request
        )

        return {"status": "success", "message": "Password reset email sent successfully."}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Initiate Google Login
# Frontend calls this → user gets redirected to Google
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/google/login")
async def google_login():
    """
    Redirects user to Google OAuth consent screen via Supabase.
    Frontend just calls: window.location.href = '/auth/google/login'
    """
    try:
        response = supabase.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": f"{BACKEND_URL}/auth/google/callback"
            }
        })

        if not response.url:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate Google OAuth URL."
            )

        # Redirect user to Google
        return RedirectResponse(url=response.url)

    except Exception as e:
        logger.error(f"Google login initiation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Google Callback
# Google redirects here after user approves
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/google/callback")
async def google_callback(
    request:          Request,
    background_tasks: BackgroundTasks,
    code:             str = None,
    error:            str = None,):
    """
    Handles Google OAuth callback.
    Exchanges code for session, creates user if first login,
    then redirects to frontend with access token.
    """

    # ── Handle OAuth error ────────────────────────────────────────────────────
    if error:
        logger.error(f"Google OAuth error: {error}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/login?error={error}"
        )

    if not code:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/login?error=no_code"
        )

    try:
        # ── Exchange code for session ─────────────────────────────────────────
        session_response = supabase.auth.exchange_code_for_session({
            "auth_code": code
        })

        if not session_response.user:
            return RedirectResponse(
                url=f"{FRONTEND_URL}/login?error=auth_failed"
            )

        user         = session_response.user
        session      = session_response.session
        user_id      = user.id
        email        = user.email
        access_token = session.access_token

        # Extract Google profile data
        user_metadata = user.user_metadata or {}
        full_name     = (
            user_metadata.get("full_name") or
            user_metadata.get("name") or
            email.split("@")[0]
        )
        avatar_url = user_metadata.get("avatar_url", "#")

        # ── Check if user exists in DimUsers ──────────────────────────────────
        existing_user = supabase.table("DimUsers") \
            .select("user_id, email, full_name") \
            .eq("user_id", user_id) \
            .execute()

        is_new_user = not existing_user.data

        # ── Create user if first Google login ─────────────────────────────────
        if is_new_user:
            try:
                supabase.table("DimUsers").insert({
                    "user_id":             user_id,
                    "email":               email,
                    "full_name":           full_name,
                    "role":                "user",
                    "company_name":        None,
                    "phone_number":        None,
                    "subscription_plan":   None,
                    "profile_picture_url": avatar_url,
                    "terms_accepted":      True,
                }).execute()

                logger.info(f"New Google user created: {email}")

            except Exception as e:
                logger.error(f"Failed to create user record: {e}")
                # Don't block login — user exists in Supabase Auth

        else:
            # ── Update last login + avatar for existing user ──────────────────
            try:
                supabase.table("DimUsers").update({
                    "profile_picture_url": avatar_url,
                    "last_login":          "now()",
                }).eq("user_id", user_id).execute()
            except Exception as e:
                logger.warning(f"Failed to update last login: {e}")

        # ── Background tasks ──────────────────────────────────────────────────
        background_tasks.add_task(
            log_login,
            user_id = user_id,
            email   = email,
            status  = "success",
            request = request
        )

        background_tasks.add_task(
            send_login_alert_email,
            to_email   = email,
            ip_address = request.client.host if request.client else None,
            user_agent = request.headers.get("User-Agent")
        )

        # ── Redirect to frontend with token ───────────────────────────────────
        # Frontend reads token from URL and stores in localStorage/cookie
        redirect_url = (
            f"{FRONTEND_URL}/auth/success"
            f"?access_token={access_token}"
            f"&user_id={user_id}"
            f"&email={email}"
            f"&is_new={str(is_new_user).lower()}"
        )

        return RedirectResponse(url=redirect_url)

    except Exception as e:
        logger.error(f"Google callback failed: {e}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/login?error=callback_failed"
        )


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Token Verification (Frontend calls after redirect)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/google/verify")
async def verify_google_token(access_token: str):
    """
    Frontend calls this after receiving token from callback redirect.
    Verifies token and returns full user profile.
    """
    try:
        # Verify token with Supabase
        user_response = supabase.auth.get_user(access_token)

        if not user_response.user:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired token."
            )

        user    = user_response.user
        user_id = user.id

        # Fetch user profile from DimUsers
        profile = supabase.table("DimUsers") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        user_data = profile.data[0] if profile.data else {
            "user_id":  user_id,
            "email":    user.email,
            "full_name": user.user_metadata.get("full_name", ""),
        }

        return {
            "status":       "success",
            "user":         user_data,
            "access_token": access_token,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Mobile / SPA: Exchange Supabase token directly
# For apps that handle OAuth on frontend (React Native, Next.js)
# ─────────────────────────────────────────────────────────────────────────────

class GoogleTokenRequest(BaseModel):
    access_token:  str
    refresh_token: Optional[str] = None


@router.post("/google/exchange")
async def exchange_google_token(
    request:          GoogleTokenRequest,
    req:              Request,
    background_tasks: BackgroundTasks,):
    """
    For frontend apps that handle Google OAuth themselves.
    Pass the Supabase access_token here to get full user profile.
    Used when frontend uses Supabase JS client directly.
    """
    try:
        user_response = supabase.auth.get_user(request.access_token)

        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token.")

        user    = user_response.user
        user_id = user.id
        email   = user.email

        # Check / create user in DimUsers
        existing = supabase.table("DimUsers") \
            .select("user_id") \
            .eq("user_id", user_id) \
            .execute()

        is_new_user = not existing.data

        if is_new_user:
            meta      = user.user_metadata or {}
            full_name = meta.get("full_name") or meta.get("name") or email.split("@")[0]
            avatar    = meta.get("avatar_url", "#")

            supabase.table("DimUsers").insert({
                "user_id":             user_id,
                "email":               email,
                "full_name":           full_name,
                "role":                "user",
                "company_name":        None,
                "phone_number":        None,
                "subscription_plan":   None,
                "profile_picture_url": avatar,
                "terms_accepted":      True,
            }).execute()

        # Fetch profile
        profile = supabase.table("DimUsers") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        background_tasks.add_task(
            log_login,
            user_id = user_id,
            email   = email,
            status  = "success",
            request = req
        )

        background_tasks.add_task(
            send_login_alert_email,
            to_email   = email,
            ip_address = req.client.host if req.client else None,
            user_agent = req.headers.get("User-Agent")
        )

        return {
            "status":       "success",
            "user":         profile.data[0] if profile.data else {},
            "access_token": request.access_token,
            "is_new_user":  is_new_user,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Token exchange failed: {str(e)}"
        )

@router.get("/google/handle")
async def google_handle(
    request:          Request,
    background_tasks: BackgroundTasks,
    code:             str = None,
    error:            str = None,):
    """
    Frontend forwards the code here after receiving it from Supabase.
    Call this from frontend: 
        fetch(`/auth/google/handle?code=${code}`)
    """
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")

    if not code:
        raise HTTPException(status_code=400, detail="No code provided.")

    try:
        # Exchange code for session
        session_response = supabase.auth.exchange_code_for_session({
            "auth_code": code
        })

        if not session_response.user:
            raise HTTPException(status_code=401, detail="Auth failed.")

        user         = session_response.user
        session      = session_response.session
        user_id      = user.id
        email        = user.email
        access_token = session.access_token

        # Extract Google profile
        user_metadata = user.user_metadata or {}
        full_name     = (
            user_metadata.get("full_name") or
            user_metadata.get("name") or
            email.split("@")[0]
        )
        avatar_url = user_metadata.get("avatar_url", "#")

        # Check if user exists
        existing_user = supabase.table("DimUsers") \
            .select("user_id") \
            .eq("user_id", user_id) \
            .execute()

        is_new_user = not existing_user.data

        if is_new_user:
            supabase.table("DimUsers").insert({
                "user_id":             user_id,
                "email":               email,
                "full_name":           full_name,
                "role":                "user",
                "company_name":        None,
                "phone_number":        None,
                "subscription_plan":   None,
                "profile_picture_url": avatar_url,
                "terms_accepted":      True,
            }).execute()
            logger.info(f"New Google user created: {email}")

        else:
            supabase.table("DimUsers").update({
                "profile_picture_url": avatar_url,
                "last_login":          "now()",
            }).eq("user_id", user_id).execute()

        # Fetch full profile
        profile = supabase.table("DimUsers") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        # Background tasks
        background_tasks.add_task(
            log_login,
            user_id = user_id,
            email   = email,
            status  = "success",
            request = request
        )
        background_tasks.add_task(
            send_login_alert_email,
            to_email   = email,
            ip_address = request.client.host if request.client else None,
            user_agent = request.headers.get("User-Agent")
        )

        return {
            "status":       "success",
            "access_token": access_token,
            "user_id":      user_id,
            "email":        email,
            "is_new_user":  is_new_user,
            "user":         profile.data[0] if profile.data else {},
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google handle failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Google auth failed: {str(e)}"
        )


# ── Verify OTP ────────────────────────────────────────────────────────────────
@router.post("/2fa/verify")
async def verify_2fa(
    request:          OTPVerifyRequest,
    background_tasks: BackgroundTasks,
    Requests:         Request,):
    """
    Step 2 of login when 2FA is enabled.
    Frontend calls this after /sign_in returns status: '2fa_required'.
    """
    result = await verify_otp(
        user_id   = request.user_id,
        otp_input = request.otp
    )

    if result["status"] != "success":
        return JSONResponse(
            status_code = 400,
            content     = result
        )

    # ── OTP valid — now issue access token ────────────────────────────────────
    try:
        # Fetch user email to get fresh session
        user_data = supabase.table("DimUsers") \
            .select("email") \
            .eq("user_id", request.user_id) \
            .execute()

        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found.")

        # Get active session from Supabase
        session = supabase.auth.get_session()

        background_tasks.add_task(
            log_login,
            user_id = request.user_id,
            email   = user_data.data[0]["email"],
            status  = "success",
            request = Requests
        )

        background_tasks.add_task(
            send_login_alert_email,
            to_email = user_data.data[0]["email"]
        )

        return {
            "status":       "success",
            "message":      "Login successful.",
            "access_token": session.access_token if session else None,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Session retrieval failed: {str(e)}"
        )


# ── Resend OTP ────────────────────────────────────────────────────────────────
@router.post("/2fa/resend")
async def resend_otp(request: OTPResendRequest):
    """Resend OTP to user email."""
    user_data = supabase.table("DimUsers") \
        .select("full_name") \
        .eq("user_id", request.user_id) \
        .execute()

    full_name = user_data.data[0]["full_name"] if user_data.data else "User"

    result = await send_otp(
        user_id   = request.user_id,
        email     = request.email,
        full_name = full_name
    )

    if result["status"] == "locked":
        raise HTTPException(status_code=429, detail=result["message"])

    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    return result

# ── Enable 2FA ────────────────────────────────────────────────────────────────
@router.post("/2fa/enable")
async def enable_2fa_route(
    request:          Toggle2FARequest,
    background_tasks: BackgroundTasks,):
    """
    Enable 2FA for user.
    Requires password confirmation for security.
    Flow: confirm password → send OTP → verify OTP → enable
    """
    # ── Step 1: Verify password first ────────────────────────────────────────
    user_data = supabase.table("DimUsers") \
        .select("email, full_name") \
        .eq("user_id", request.user_id) \
        .execute()

    if not user_data.data:
        raise HTTPException(status_code=404, detail="User not found.")

    email     = user_data.data[0]["email"]
    full_name = user_data.data[0]["full_name"]

    try:
        supabase.auth.sign_in_with_password({
            "email":    email,
            "password": request.password
        })
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Password incorrect. Cannot enable 2FA."
        )

    # ── Step 2: Enable in DB ──────────────────────────────────────────────────
    result = await enable_2fa(request.user_id)
    if result["status"] != "success":
        raise HTTPException(status_code=500, detail=result["message"])

    # ── Step 3: Send confirmation OTP to verify email works ───────────────────
    await send_otp(
        user_id   = request.user_id,
        email     = email,
        full_name = full_name
    )

    # background_tasks.add_task(
    #     log_activity,
    #     user_id        = request.user_id,
    #     event_category = "security",
    #     event_type     = "2fa_enabled",
    #     description    = "Two-factor authentication enabled",
    #     metadata       = {"email": email}
    # )

    return {
        "status":  "success",
        "message": "2FA enabled. A confirmation code was sent to your email.",
    }


# ── Disable 2FA ───────────────────────────────────────────────────────────────
@router.post("/2fa/disable")
async def disable_2fa_route(
    request:          Toggle2FARequest,
    background_tasks: BackgroundTasks,):
    """Disable 2FA. Requires password confirmation."""
    user_data = supabase.table("DimUsers") \
        .select("email") \
        .eq("user_id", request.user_id) \
        .execute()

    if not user_data.data:
        raise HTTPException(status_code=404, detail="User not found.")

    email = user_data.data[0]["email"]

    # Confirm password
    try:
        supabase.auth.sign_in_with_password({
            "email":    email,
            "password": request.password
        })
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Password incorrect. Cannot disable 2FA."
        )

    result = await disable_2fa(request.user_id)
    if result["status"] != "success":
        raise HTTPException(status_code=500, detail=result["message"])

    # background_tasks.add_task(
    #     log_activity,
    #     user_id        = request.user_id,
    #     event_category = "security",
    #     event_type     = "2fa_disabled",
    #     description    = "Two-factor authentication disabled",
    #     metadata       = {"email": email}
    # )

    return {
        "status":  "success",
        "message": "2FA disabled successfully.",
    }


# ── 2FA Status ────────────────────────────────────────────────────────────────
@router.get("/2fa/status/{user_id}")
async def get_2fa_status(user_id: str):
    """Get current 2FA status for user."""
    enabled  = is_2fa_enabled_for_user(user_id)
    verified = await is_2fa_verified(user_id)
    return {
        "user_id":      user_id,
        "two_fa_enabled":  enabled,
        "session_verified": verified,
    }
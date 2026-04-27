import os
import random
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict
from Services.redis_client   import redis, is_redis_available
from Services.email_service  import send_email, _wrap_template, _badge, _now
from Integrations.pinecone_client import supabase

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
OTP_LENGTH      = 4
OTP_TTL         = 300        # 5 minutes in seconds
MAX_OTP_ATTEMPTS = 3         # max wrong attempts before lockout
LOCKOUT_TTL     = 900        # 15 min lockout after max attempts


# ─────────────────────────────────────────────────────────────────────────────
# REDIS KEY HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _otp_key(user_id: str)      -> str: return f"2fa:otp:{user_id}"
def _attempts_key(user_id: str) -> str: return f"2fa:attempts:{user_id}"
def _lockout_key(user_id: str)  -> str: return f"2fa:lockout:{user_id}"
def _verified_key(user_id: str) -> str: return f"2fa:verified:{user_id}"


# ─────────────────────────────────────────────────────────────────────────────
# OTP GENERATION
# ─────────────────────────────────────────────────────────────────────────────

def _generate_otp() -> str:
    """Generate a secure 4-digit OTP."""
    return str(random.SystemRandom().randint(1000, 9999))


# ─────────────────────────────────────────────────────────────────────────────
# EMAIL TEMPLATE
# ─────────────────────────────────────────────────────────────────────────────

def _build_otp_email(otp: str, full_name: str) -> str:
    content = f"""
    <h2 style="margin:0 0 8px;color:white;font-size:22px;">
      🔐 Your Verification Code
    </h2>
    <p style="margin:0 0 24px;color:#6c757d;font-size:15px;">
      Hi <strong>{full_name}</strong>, use the code below to
      complete your login.
    </p>

    <div style="text-align:center;margin:32px 0;">
      <div style="display:inline-block;background:#f0f4ff;
                  border:2px dashed #7c6df0;border-radius:12px;
                  padding:24px 40px;">
        <div style="font-size:42px;font-weight:700;
                    letter-spacing:12px;color:#4a6cf7;">
          {otp}
        </div>
      </div>
    </div>

    <table cellpadding="0" cellspacing="0" width="100%"
           style="border-top:1px solid #e9ecef;margin-top:16px;">
      <tr>
        <td style="padding:8px 0;color:#6c757d;font-size:14px;width:140px;">
          Expires in
        </td>
        <td style="padding:8px 0;color:#212529;font-size:14px;font-weight:500;">
          5 minutes
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6c757d;font-size:14px;">Time</td>
        <td style="padding:8px 0;color:#212529;font-size:14px;font-weight:500;">
          {_now()}
        </td>
      </tr>
    </table>
    <br>
    <p style="color:#dc3545;font-size:13px;background:#fff5f5;
              padding:12px;border-radius:6px;
              border-left:4px solid #dc3545;">
      <strong>Never share this code.</strong>
      Plugin AI will never ask for your OTP via phone or chat.
      If you didn't request this, change your password immediately.
    </p>
    """
    return _wrap_template(content, "2FA Verification Code")


# ─────────────────────────────────────────────────────────────────────────────
# CORE 2FA FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

async def send_otp(user_id: str, email: str, full_name: str) -> Dict:
    """
    Generate OTP, store in Redis, send via email.
    Returns status dict.
    """

    # ── Check if user is locked out ───────────────────────────────────────────
    if is_redis_available():
        lockout = redis.get(_lockout_key(user_id))
        if lockout:
            ttl = redis.ttl(_lockout_key(user_id))
            return {
                "status":  "locked",
                "message": f"Too many failed attempts. Try again in {ttl} seconds.",
                "retry_after": ttl,
            }

    # ── Generate OTP ──────────────────────────────────────────────────────────
    otp = _generate_otp()

    # ── Store in Redis ────────────────────────────────────────────────────────
    if is_redis_available():
        try:
            otp_data = json.dumps({
                "otp":        otp,
                "user_id":    user_id,
                "email":      email,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            redis.set(_otp_key(user_id), otp_data, ex=OTP_TTL)
            # Reset attempts on new OTP
            redis.delete(_attempts_key(user_id))
            logger.info(f"OTP stored in Redis for user: {user_id}")
        except Exception as e:
            logger.error(f"Redis OTP store failed: {e}")
            return {
                "status":  "error",
                "message": "Failed to generate OTP. Please try again."
            }
    else:
        return {
            "status":  "error",
            "message": "2FA service temporarily unavailable."
        }

    # ── Send OTP email ────────────────────────────────────────────────────────
    try:
        html    = _build_otp_email(otp, full_name)
        success = send_email(
            to_email  = email,
            subject   = "Your Plugin AI Verification Code",
            html_body = html
        )
        if not success:
            raise Exception("Email send failed")

        logger.info(f"OTP email sent to: {email}")
        return {
            "status":     "sent",
            "message":    f"Verification code sent to {email}",
            "expires_in": OTP_TTL,
        }

    except Exception as e:
        logger.error(f"OTP email send failed: {e}")
        return {
            "status":  "error",
            "message": "Failed to send verification email."
        }


async def verify_otp(user_id: str, otp_input: str) -> Dict:
    """
    Verify OTP entered by user.
    Returns status dict with success/failure.
    """

    # ── Check lockout ─────────────────────────────────────────────────────────
    if is_redis_available():
        lockout = redis.get(_lockout_key(user_id))
        if lockout:
            ttl = redis.ttl(_lockout_key(user_id))
            return {
                "status":      "locked",
                "message":     f"Account locked. Try again in {ttl} seconds.",
                "retry_after": ttl,
            }

    # ── Fetch OTP from Redis ──────────────────────────────────────────────────
    if not is_redis_available():
        return {"status": "error", "message": "2FA service unavailable."}

    try:
        stored = redis.get(_otp_key(user_id))
    except Exception as e:
        logger.error(f"Redis OTP fetch failed: {e}")
        return {"status": "error", "message": "Verification failed. Try again."}

    # ── Check if OTP exists and not expired ───────────────────────────────────
    if not stored:
        return {
            "status":  "expired",
            "message": "Verification code expired. Please request a new one."
        }

    otp_data = json.loads(stored)

    # ── Validate OTP ──────────────────────────────────────────────────────────
    if otp_data["otp"] != otp_input.strip():

        # Increment failed attempts
        attempts_key = _attempts_key(user_id)
        try:
            attempts = redis.incr(attempts_key)
            redis.expire(attempts_key, OTP_TTL)
        except Exception:
            attempts = 1

        remaining = MAX_OTP_ATTEMPTS - attempts

        # Lock account if max attempts reached
        if attempts >= MAX_OTP_ATTEMPTS:
            try:
                redis.set(_lockout_key(user_id), "1", ex=LOCKOUT_TTL)
                redis.delete(_otp_key(user_id))
                redis.delete(_attempts_key(user_id))
            except Exception:
                pass

            return {
                "status":      "locked",
                "message":     f"Too many failed attempts. Account locked for {LOCKOUT_TTL // 60} minutes.",
                "retry_after": LOCKOUT_TTL,
            }

        return {
            "status":    "invalid",
            "message":   f"Invalid code. {remaining} attempt(s) remaining.",
            "remaining": remaining,
        }

    # ── OTP valid — clean up Redis ────────────────────────────────────────────
    try:
        redis.delete(_otp_key(user_id))
        redis.delete(_attempts_key(user_id))
        # Mark as 2FA verified for this session (30 min)
        redis.set(_verified_key(user_id), "1", ex=1800)
    except Exception as e:
        logger.warning(f"Redis OTP cleanup failed: {e}")

    logger.info(f"2FA verified successfully for user: {user_id}")
    return {
        "status":  "success",
        "message": "Verification successful.",
    }


async def is_2fa_verified(user_id: str) -> bool:
    """Check if user has verified 2FA in current session."""
    if not is_redis_available():
        return False
    try:
        return bool(redis.get(_verified_key(user_id)))
    except Exception:
        return False


async def enable_2fa(user_id: str) -> Dict:
    """Enable 2FA for a user in DimUsers table."""
    try:
        supabase.table("DimUsers").update({
            "two_fa_enabled":     True,
            "two_fa_verified_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()

        logger.info(f"2FA enabled for user: {user_id}")
        return {"status": "success", "message": "2FA enabled successfully."}

    except Exception as e:
        logger.error(f"Enable 2FA failed: {e}")
        return {"status": "error", "message": str(e)}


async def disable_2fa(user_id: str) -> Dict:
    """Disable 2FA for a user."""
    try:
        supabase.table("DimUsers").update({
            "two_fa_enabled":     False,
            "two_fa_verified_at": None,
        }).eq("user_id", user_id).execute()

        # Clear any active 2FA session
        if is_redis_available():
            redis.delete(_verified_key(user_id))

        logger.info(f"2FA disabled for user: {user_id}")
        return {"status": "success", "message": "2FA disabled successfully."}

    except Exception as e:
        logger.error(f"Disable 2FA failed: {e}")
        return {"status": "error", "message": str(e)}


def is_2fa_enabled_for_user(user_id: str) -> bool:
    """Check if user has 2FA enabled in DB."""
    try:
        result = supabase.table("DimUsers") \
            .select("two_fa_enabled") \
            .eq("user_id", user_id) \
            .execute()
        if result.data:
            return result.data[0].get("two_fa_enabled", False) or False
        return False
    except Exception:
        return False
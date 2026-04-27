import os
import logging
import jwt
from jwt             import PyJWKClient
from fastapi         import HTTPException, Security, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from Integrations.pinecone_client import supabase
from typing          import Optional
from dotenv          import load_dotenv
from Services.two_fa_service import is_2fa_enabled_for_user, is_2fa_verified

load_dotenv(override=True)
logger      = logging.getLogger(__name__)
http_bearer = HTTPBearer(auto_error=False)

JWKS_URL = os.getenv("SUPABASE_JWKS_URL")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# ── JWKS client — fetches Supabase public keys automatically ──────────────────
# Caches the key so it doesn't fetch on every request

jwks_client = PyJWKClient(JWKS_URL, cache_keys=True)


# ─────────────────────────────────────────────────────────────────────────────
# CORE TOKEN VERIFIER — handles both ES256 and HS256 automatically
# ─────────────────────────────────────────────────────────────────────────────

def verify_token(token: str) -> dict:
    """
    Verify Supabase JWT token.
    Automatically handles both ES256 (new) and HS256 (legacy).
    Returns decoded payload on success.
    Raises HTTPException on failure.
    """
    try:
        # ── Check algorithm from token header ─────────────────────────────────
        header = jwt.get_unverified_header(token)
        alg    = header.get("alg", "HS256")

        if alg == "ES256":
            # ── New asymmetric ES256 — fetch public key from JWKS ─────────────
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload     = jwt.decode(
                token,
                signing_key.key,
                algorithms = ["ES256"],
                audience   = "authenticated",
                options    = {"verify_exp": True},
            )

        else:
            # ── Legacy symmetric HS256 — use JWT secret ───────────────────────
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(
                    status_code = 500,
                    detail      = "SUPABASE_JWT_SECRET not configured."
                )
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms = ["HS256"],
                audience   = "authenticated",
                options    = {
                    "verify_exp": True,
                    "verify_aud": True,
                },
            )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code = 401,
            detail      = "Token expired. Please login again.",
            headers     = {"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidAudienceError:
        # Retry without audience validation
        try:
            header = jwt.get_unverified_header(token)
            alg    = header.get("alg", "HS256")
            if alg == "ES256":
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                return jwt.decode(
                    token,
                    signing_key.key,
                    algorithms = ["ES256"],
                    options    = {"verify_exp": True, "verify_aud": False},
                )
            else:
                return jwt.decode(
                    token,
                    SUPABASE_JWT_SECRET,
                    algorithms = ["HS256"],
                    options    = {"verify_exp": True, "verify_aud": False},
                )
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code = 401,
            detail      = f"Invalid token: {str(e)}",
            headers     = {"WWW-Authenticate": "Bearer"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed.")


# ─────────────────────────────────────────────────────────────────────────────
# FASTAPI DEPENDENCY
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(http_bearer)) -> dict:
    """
    FastAPI dependency — validates token and returns current user.
    Usage: current_user = Depends(get_current_user)
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code = 401,
            detail      = "Authorization token required.",
            headers     = {"WWW-Authenticate": "Bearer"}
        )

    token   = credentials.credentials
    payload = verify_token(token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    # ── Fetch user from DimUsers ──────────────────────────────────────────────
    try:
        result = supabase.table("DimUsers") \
            .select("user_id, email, full_name, role, subscription_plan") \
            .eq("user_id", user_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=401, detail="User not found.")

        user = result.data[0]

        if user.get("role") == "suspended":
            raise HTTPException(
                status_code = 403,
                detail      = "Account suspended. Contact support."
            )

        return user

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"User fetch error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed.")


async def verify_2fa_session(current_user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency — validates token and ensures 2FA is verified if enabled.
    Use this for high-security actions (payments, API keys, deletions).
    Usage: current_user = Depends(verify_2fa_session)
    """
    user_id = current_user["user_id"]
    
    # 1. Check if user has 2FA enabled
    is_enabled = is_2fa_enabled_for_user(user_id)
    if not is_enabled:
        return current_user # Bypass if 2FA is not enabled
        
    # 2. Check if the current session is 2FA verified
    is_verified = await is_2fa_verified(user_id)
    if not is_verified:
        raise HTTPException(
            status_code=403,
            detail="Two-factor authentication required for this action."
        )
        
    return current_user


# ─────────────────────────────────────────────────────────────────────────────
# OWNERSHIP GUARDS
# ─────────────────────────────────────────────────────────────────────────────

def verify_ownership(current_user: dict, resource_user_id: str) -> None:
    if current_user.get("role") == "admin":
        return
    if current_user["user_id"] != resource_user_id:
        raise HTTPException(
            status_code = 403,
            detail      = "Access denied. You can only access your own data."
        )


async def verify_workspace_ownership(
    workspace_name: str,
    current_user:   dict) -> None:
    if current_user.get("role") == "admin":
        return

    result = supabase.table("DimWorkSpaces") \
        .select("user_id") \
        .eq("workspace_name", workspace_name) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    if result.data[0]["user_id"] != current_user["user_id"]:
        raise HTTPException(
            status_code = 403,
            detail      = "Access denied. This workspace does not belong to you."
        )
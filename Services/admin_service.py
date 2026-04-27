import logging
from typing import Optional, Dict
from fastapi  import HTTPException, Request
from fastapi import Depends
from Integrations.pinecone_client import supabase
from Services.auth_dependency import verify_2fa_session

logger     = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN AUTH DEPENDENCY
# ─────────────────────────────────────────────────────────────────────────────

async def verify_admin_token(
    request: Request,
    current_user: dict = Depends(verify_2fa_session)
) -> dict:
    """
    FastAPI dependency — validates admin JWT token and ensures the user has an admin role.
    Add to any route: admin = Depends(verify_admin_token)
    Returns the admin user dictionary on success.
    """
    if current_user.get("role") != "admin":
        logger.warning(
            f"Unauthorized admin access attempt by {current_user.get('email')} from IP: "
            f"{request.client.host if request.client else 'unknown'}"
        )
        raise HTTPException(
            status_code=403,
            detail="Forbidden. Admin access required."
        )

    return current_user


# ─────────────────────────────────────────────────────────────────────────────
# AUDIT LOGGER
# ─────────────────────────────────────────────────────────────────────────────

async def audit_log(
    action:      str,
    description: str,
    target_type: Optional[str]       = None,
    target_id:   Optional[str]       = None,
    metadata:    Optional[Dict]      = None,
    request:     Optional[Request]   = None,
    admin_label: str                 = "admin",
) -> None:
    """
    Log every admin action to AdminAuditLogs.
    Always call via BackgroundTasks — never await directly.
    """
    try:
        supabase.table("AdminAuditLogs").insert({
            "admin_key_label": admin_label,
            "action":          action,
            "target_type":     target_type,
            "target_id":       target_id,
            "description":     description,
            "metadata":        metadata or {},
            "ip_address":      (
                request.client.host
                if request and request.client else None
            ),
        }).execute()
    except Exception as e:
        logger.error(f"Admin audit log failed: {e}")


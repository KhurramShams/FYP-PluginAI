import logging
from typing import Optional, Dict, Any
from fastapi import Request
from Integrations.pinecone_client import supabase
import uuid

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# CORE LOGGER — 100% dynamic, no fixed enums
# ─────────────────────────────────────────────────────────────────────────────

async def log_activity(
    user_id:        str,
    event_category: str,          # "auth" | "file" | "workspace" | "billing" | anything
    event_type:     str,          # "login" | "file_upload" | "workspace_create" | anything
    description:    str,          # human-readable: "Logged in", "Uploaded report.pdf"
    status:         str = "success",  # "success" | "failed" | "pending"
    workspace_name: Optional[str] = None,
    metadata:       Optional[Dict[str, Any]] = None,
    request:        Optional[Request] = None,) -> None:
    try:
        log_entry = {
            "user_id":        user_id,
            "event_category": event_category,
            "event_type":     event_type,
            "description":    description,
            "event_status":   status,
            "workspace_name": workspace_name,
            "metadata":       metadata or {},
            "ip_address":     _get_ip(request) if request else None,
            "user_agent":     _get_user_agent(request) if request else None,
        }

        supabase.table("user_activity_logs").insert(log_entry).execute()
        logger.info(f"Activity logged: [{event_category}] {event_type} "
                    f"— {description} (user: {user_id})")

    except Exception as e:
        # Never break main flow
        logger.error(f"Activity log failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# HELPER FUNCTIONS — pre-built calls for common events
# Each is a thin wrapper over log_activity with sensible defaults
# You can add new ones anytime without touching the core logger
# ─────────────────────────────────────────────────────────────────────────────

async def log_login(
    user_id: str,
    email:   str,
    status:  str = "success",
    request: Optional[Request] = None,) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "auth",
        event_type     = "login",
        description    = f"Logged in ({email})",
        status         = status,
        metadata       = {"email": email},
        request        = request,
    )


async def log_logout(
    user_id: str,
    email:   str,
    request: Optional[Request] = None,) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "auth",
        event_type     = "logout",
        description    = f"Logged out ({email})",
        metadata       = {"email": email},
        request        = request,
    )


async def log_password_change(
    user_id: str,
    email:   str,
    request: Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "auth",
        event_type     = "password_change",
        description    = "Password changed",
        metadata       = {"email": email},
        request        = request,
    )


async def log_file_upload(
    user_id:        str,
    file_name:      str,
    workspace_name: str,
    file_type:      Optional[str] = None,
    file_size_kb:   Optional[float] = None,
    document_id:    Optional[str] = None,
    request:        Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "file",
        event_type     = "file_upload",
        description    = f"Uploaded file: {file_name}",
        workspace_name = workspace_name,
        metadata       = {
            "file_name":    file_name,
            "file_type":    file_type,
            "file_size_kb": file_size_kb,
            "document_id":  document_id,
        },
        request = request,
    )


async def log_file_delete(
    user_id:        str,
    file_name:      str,
    workspace_name: str,
    document_id:    Optional[str] = None,
    request:        Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "file",
        event_type     = "file_delete",
        description    = f"Deleted file: {file_name}",
        workspace_name = workspace_name,
        metadata       = {
            "file_name":   file_name,
            "document_id": document_id,
        },
        request = request,
    )


async def log_workspace_create(
    user_id:        str,
    workspace_name: str,
    request:        Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "workspace",
        event_type     = "workspace_create",
        description    = f"Created workspace: {workspace_name}",
        workspace_name = workspace_name,
        request        = request,
    )


async def log_workspace_update(
    user_id:        str,
    workspace_name: str,
    changes:        Optional[Dict] = None,
    request:        Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "workspace",
        event_type     = "workspace_update",
        description    = f"Updated workspace: {workspace_name}",
        workspace_name = workspace_name,
        metadata       = {"changes": changes or {}},
        request        = request,
    )


async def log_workspace_delete(
    user_id:        str,
    workspace_name: str,
    request:        Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "workspace",
        event_type     = "workspace_delete",
        description    = f"Deleted workspace: {workspace_name}",
        workspace_name = workspace_name,
        request        = request,
    )


async def log_plan_upgrade(
    user_id:   str,
    old_plan:  str,
    new_plan:  str,
    request:   Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "billing",
        event_type     = "plan_upgrade",
        description    = f"Upgraded plan: {old_plan} → {new_plan}",
        metadata       = {"old_plan": old_plan, "new_plan": new_plan},
        request        = request,
    )

async def log_plan_renew(
    user_id:   str,
    plan:  str,
    request:   Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "billing",
        event_type     = "plan_renewal",
        description    = f"plan_renewal plan: {plan} → {plan}",
        metadata       = {"old_plan": plan, "new_plan": plan},
        request        = request,
    )


async def log_plan_cancelled(
    user_id:  str,
    plan:     str,
    request:  Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "billing",
        event_type     = "plan_cancelled",
        description    = f"Cancelled plan: {plan}",
        metadata       = {"plan": plan},
        request        = request,
    )


async def log_payment(
    user_id:  str,
    status:   str,          # "success" | "failed"
    plan:     str,
    amount:   Optional[str] = None,
    request:  Optional[Request] = None,
) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "billing",
        event_type     = f"payment_{status}",
        description    = f"Payment {status} for {plan}"
                         + (f" — {amount}" if amount else ""),
        status         = status,
        metadata       = {"plan": plan, "amount": amount},
        request        = request,
    )


# ─────────────────────────────────────────────────────────────────────────────
# QUERY HELPER
# ─────────────────────────────────────────────────────────────────────────────

async def get_user_activity(
    user_id:  str,
    category: Optional[str] = None,
    limit:    int = 20,
    offset:   int = 0,
) -> Dict:
    try:
        query = (
            supabase.table("user_activity_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .offset(offset)
        )
        if category:
            query = query.eq("event_category", category)

        result = query.execute()
        return {
            "logs":   result.data,
            "count":  len(result.data),
            "offset": offset,
            "limit":  limit,
        }
    except Exception as e:
        logger.error(f"Failed to fetch activity logs: {e}")
        return {"logs": [], "count": 0, "offset": offset, "limit": limit}

async def log_api_create(
    user_id:        str,
    workspace_name: str,
    api_key_prefix: Optional[str] = None,
    request:        Optional[Request] = None,) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "api",
        event_type     = "api_create",
        description    = "Created new API key",
        workspace_name = workspace_name,
        metadata       = {"api_key_prefix": api_key_prefix},
        request        = request,
    )


async def log_api_delete(
    user_id:        str,
    workspace_name: str,
    api_key_prefix: Optional[str] = None,
    request:        Optional[Request] = None,) -> None:
    await log_activity(
        user_id        = user_id,
        event_category = "api",
        event_type     = "api_delete",
        description    = "Deleted API key",
        workspace_name = workspace_name,
        metadata       = {"api_key_prefix": api_key_prefix},
        request        = request,
    )


# ─────────────────────────────────────────────────────────────────────────────
# UTILS
# ─────────────────────────────────────────────────────────────────────────────

def _get_user_agent(request: Request | None):
    try:
        if request and hasattr(request, "headers"):
            return request.headers.get("user-agent")
        return None
    except:
        return None

def _get_ip(request: Request | None):
    try:
        if request and request.client:
            return request.client.host
        return None
    except:
        return None
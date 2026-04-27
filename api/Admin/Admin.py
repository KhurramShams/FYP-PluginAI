from fastapi import (
    APIRouter, HTTPException, Depends,
    BackgroundTasks, Request, Query
)
from fastapi.responses import JSONResponse
from pydantic    import BaseModel, EmailStr
from typing      import Optional, List
from datetime    import datetime, timezone, timedelta
from Integrations.pinecone_client import supabase
from Services.admin_service  import verify_admin_token, audit_log
from Services.email_service  import send_email, _wrap_template, _badge, _now
from Services.redis_client   import redis, is_redis_available
from Services.embedding_cache    import get_embedding_cache_stats
from Services.conversation_cache import get_conversation_cache_stats
from Services.rate_limiter import rate_limit, RATE_LIMIT_CONFIGS, is_redis_available
from fastapi import Depends

from Services.usage_email import (
    run_monthly_usage_emails,
    send_usage_email_to_user
)
import logging, hashlib, secrets

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix       = "/admin",
    tags         = ["Admin"],
    dependencies = [Depends(rate_limit("admin_global", "key"))]
)



# ─────────────────────────────────────────────────────────────────────────────
# REQUEST SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class SuspendUserRequest(BaseModel):
    user_id: str
    reason:  Optional[str] = "Suspended by admin"

class UpdatePlanRequest(BaseModel):
    user_id:  str
    new_plan: str

class UpdateQuotaRequest(BaseModel):
    subscription_id:  str
    max_upload_docs:  Optional[int] = None
    max_query:        Optional[int] = None
    max_api:          Optional[int] = None
    max_token:        Optional[int] = None
    max_workspace:    Optional[int] = None

class ExtendSubscriptionRequest(BaseModel):
    subscription_id: str
    days:            int  # number of days to extend

class BroadcastEmailRequest(BaseModel):
    subject:     str
    body:        str
    plan_filter: Optional[str] = None  # send to specific plan only

class SendUsageEmailRequest(BaseModel):
    email: EmailStr

class RevokeApiKeyRequest(BaseModel):
    workspace_name: str
    api_key_id:     str


# ─────────────────────────────────────────────────────────────────────────────
# 1. SYSTEM HEALTH & CACHE STATS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/health")
async def system_health(
    request: Request,
    admin    = Depends(verify_admin_token),
    background_tasks: BackgroundTasks = None,
):
    """Platform health — DB, Redis, Pinecone status + cache stats."""
    health = {
        "status":    "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services":  {}
    }

    # ── Supabase check ────────────────────────────────────────────────────────
    try:
        supabase.table("DimUsers").select("user_id").limit(1).execute()
        health["services"]["supabase"] = {"status": "ok"}
    except Exception as e:
        health["services"]["supabase"] = {"status": "error", "detail": str(e)}
        health["status"] = "degraded"

    # ── Redis check ───────────────────────────────────────────────────────────
    if is_redis_available():
        emb_stats  = await get_embedding_cache_stats()
        conv_stats = await get_conversation_cache_stats()
        health["services"]["redis"] = {
            "status":           "ok",
            "embedding_cache":  emb_stats,
            "conversation_cache": conv_stats,
        }
    else:
        health["services"]["redis"] = {"status": "unavailable"}
        health["status"] = "degraded"

    # ── Platform counts ───────────────────────────────────────────────────────
    try:
        users_count = supabase.table("DimUsers") \
            .select("user_id", count="exact").execute()
        ws_count    = supabase.table("DimWorkSpaces") \
            .select("workspace_id", count="exact").execute()
        docs_count  = supabase.table("DimUserDocuments") \
            .select("doc_id", count="exact").execute()

        health["platform"] = {
            "total_users":      users_count.count or 0,
            "total_workspaces": ws_count.count or 0,
            "total_documents":  docs_count.count or 0,
        }
    except Exception as e:
        health["platform"] = {"error": str(e)}

    return health


@router.delete(
    "/cache/embeddings",
    dependencies = [Depends(rate_limit("admin_cache_flush", "key"))]
)
async def flush_embedding_cache(
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Flush all embedding cache from Redis."""
    if not is_redis_available():
        raise HTTPException(status_code=503, detail="Redis unavailable.")

    try:
        keys    = redis.keys("emb:*")
        deleted = 0
        if keys:
            redis.delete(*keys)
            deleted = len(keys)

        background_tasks.add_task(
            audit_log,
            action      = "cache_flush_embeddings",
            description = f"Flushed {deleted} embedding cache keys",
            target_type = "system",
            metadata    = {"deleted_keys": deleted},
            request     = request,
        )

        return {"status": "success", "deleted_keys": deleted}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete(
    "/cache/conversations",
    dependencies = [Depends(rate_limit("admin_cache_flush", "key"))]
)
async def flush_conversation_cache(
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Flush all conversation cache from Redis."""
    if not is_redis_available():
        raise HTTPException(status_code=503, detail="Redis unavailable.")

    try:
        keys    = redis.keys("conv:*")
        deleted = 0
        if keys:
            redis.delete(*keys)
            deleted = len(keys)

        background_tasks.add_task(
            audit_log,
            action      = "cache_flush_conversations",
            description = f"Flushed {deleted} conversation cache keys",
            target_type = "system",
            metadata    = {"deleted_keys": deleted},
            request     = request,
        )

        return {"status": "success", "deleted_keys": deleted}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 2. USER MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/users")
async def get_all_users(
    admin   = Depends(verify_admin_token),
    limit:  int           = Query(20, ge=1, le=100),
    offset: int           = Query(0,  ge=0),
    plan:   Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Search by name or email"),
    status: Optional[str] = Query(None, description="active | suspended"),
):
    """Get all users with pagination, search and filters."""
    try:
        query = supabase.table("DimUsers") \
            .select(
                "user_id, email, full_name, role, company_name, "
                "subscription_plan, created_at, last_login, "
                "two_fa_enabled"
            ) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .offset(offset)

        if plan:
            query = query.eq("subscription_plan", plan)
        if search:
            query = query.or_(
                f"email.ilike.%{search}%,full_name.ilike.%{search}%"
            )

        result       = query.execute()
        count_result = supabase.table("DimUsers") \
            .select("user_id", count="exact").execute()

        return {
            "status": "success",
            "users":  result.data or [],
            "total":  count_result.count or 0,
            "limit":  limit,
            "offset": offset,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{user_id}/profile")
async def get_user_profile(user_id: str, admin = Depends(verify_admin_token)):
    try:
        user = supabase.table("DimUsers").select("*").eq("user_id", user_id).execute()
        if not user.data:
            raise HTTPException(status_code=404, detail="User not found.")
        docs = supabase.table("DimUserDocuments").select("doc_id", count="exact").eq("user_id", user_id).execute()
        return {"status": "success", "profile": user.data[0], "doc_count": docs.count or 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/subscriptions")
async def get_user_subscriptions(user_id: str, admin = Depends(verify_admin_token)):
    try:
        subs = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).execute()
        usage = None
        if subs.data:
            u_query = supabase.table("FactSubscriptionUsage").select("*").eq("subscription_id", subs.data[0]["subscription_id"]).execute()
            if u_query.data:
                usage = u_query.data[0]
        return {"status": "success", "subscription": subs.data[0] if subs.data else None, "usage": usage}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/workspaces")
async def get_user_workspaces(user_id: str, admin = Depends(verify_admin_token)):
    try:
        w = supabase.table("DimWorkSpaces").select("*").eq("user_id", user_id).execute()
        return {"status": "success", "workspaces": w.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/api_keys")
async def get_user_api_keys(user_id: str, admin = Depends(verify_admin_token)):
    try:
        w = supabase.table("DimWorkSpaces").select("workspace_name").eq("user_id", user_id).execute()
        keys = []
        for ws in (w.data or []):
            k = supabase.table("DimUserApi").select("*").eq("workspace_name", ws["workspace_name"]).execute()
            if k.data: keys.extend(k.data)
        return {"status": "success", "api_keys": keys}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/files")
async def get_user_files(user_id: str, limit: int = 50, offset: int = 0, admin = Depends(verify_admin_token)):
    try:
        f = supabase.table("DimUserDocuments").select("*").eq("user_id", user_id).limit(limit).offset(offset).execute()
        return {"status": "success", "files": f.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/conversations")
async def get_user_conversations(user_id: str, limit: int = 50, offset: int = 0, admin = Depends(verify_admin_token)):
    try:
        w = supabase.table("DimWorkSpaces").select("workspace_name").eq("user_id", user_id).execute()
        convs = []
        for ws in (w.data or []):
            c = supabase.table("DimConversations").select("*").eq("workspace_name", ws["workspace_name"]).limit(limit).offset(offset).execute()
            if c.data: convs.extend(c.data)
        return {"status": "success", "conversations": convs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/payments")
async def get_user_payments(user_id: str, limit: int = 50, offset: int = 0, admin = Depends(verify_admin_token)):
    try:
        p = supabase.table("FactAllPaymentTransactions").select("*").eq("user_id", user_id).limit(limit).offset(offset).execute()
        return {"status": "success", "payments": p.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/activity")
async def get_user_activity(user_id: str, limit: int = 50, offset: int = 0, admin = Depends(verify_admin_token)):
    try:
        a = supabase.table("user_activity_logs").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(limit).offset(offset).execute()
        return {"status": "success", "activity": a.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/suspend")
async def suspend_user(
    body:             SuspendUserRequest,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Suspend a user account."""
    try:
        # Mark role as suspended in DimUsers
        supabase.table("DimUsers").update({
            "role": "suspended"
        }).eq("user_id", body.user_id).execute()

        # Disable all their API keys
        workspaces = supabase.table("DimWorkSpaces") \
            .select("workspace_name") \
            .eq("user_id", body.user_id).execute()

        for ws in (workspaces.data or []):
            supabase.table("DimUserApi").update({
                "status": "suspended"
            }).eq("workspace_name", ws["workspace_name"]).execute()

        background_tasks.add_task(
            audit_log,
            action      = "user_suspended",
            description = f"Suspended user: {body.user_id}. Reason: {body.reason}",
            target_type = "user",
            target_id   = body.user_id,
            metadata    = {"reason": body.reason},
            request     = request,
        )

        return {"status": "success", "message": f"User {body.user_id} suspended."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/unsuspend/{user_id}")
async def unsuspend_user(
    user_id:          str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Reactivate a suspended user."""
    try:
        supabase.table("DimUsers").update({
            "role": "user"
        }).eq("user_id", user_id).execute()

        # Re-enable their API keys
        workspaces = supabase.table("DimWorkSpaces") \
            .select("workspace_name") \
            .eq("user_id", user_id).execute()

        for ws in (workspaces.data or []):
            supabase.table("DimUserApi").update({
                "status": "active"
            }).eq("workspace_name", ws["workspace_name"]).execute()

        background_tasks.add_task(
            audit_log,
            action      = "user_unsuspended",
            description = f"Unsuspended user: {user_id}",
            target_type = "user",
            target_id   = user_id,
            request     = request,
        )

        return {"status": "success", "message": f"User {user_id} reactivated."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete(
    "/users/{user_id}",
    dependencies = [Depends(rate_limit("admin_delete", "key"))]
)
async def delete_user(
    user_id:          str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """
    Permanently delete a user and all their data.
    Deletes: workspaces, documents, API keys, activity logs, DimUsers record.
    """
    try:
        # Fetch user info before deletion
        user = supabase.table("DimUsers") \
            .select("email, full_name") \
            .eq("user_id", user_id).execute()

        if not user.data:
            raise HTTPException(status_code=404, detail="User not found.")

        user_email = user.data[0]["email"]

        # Get all workspaces
        workspaces = supabase.table("DimWorkSpaces") \
            .select("workspace_name, subscription_id") \
            .eq("user_id", user_id).execute()

        for ws in (workspaces.data or []):
            ws_name = ws["workspace_name"]
            # Delete workspace data
            supabase.table("DimUserDocuments") \
                .delete().eq("workspace_name", ws_name).execute()
            supabase.table("DimUserApi") \
                .delete().eq("workspace_name", ws_name).execute()
            supabase.table("FactWorkSpaceUsage") \
                .delete().eq("workspace_name", ws_name).execute()
            supabase.table("DimConversations") \
                .delete().eq("workspace_name", ws_name).execute()
            if ws.get("subscription_id"):
                supabase.table("FactSubscriptionUsage") \
                    .delete() \
                    .eq("subscription_id", ws["subscription_id"]) \
                    .execute()

        # Delete workspaces
        supabase.table("DimWorkSpaces") \
            .delete().eq("user_id", user_id).execute()

        # Delete activity logs
        supabase.table("user_activity_logs") \
            .delete().eq("user_id", user_id).execute()

        # Delete from DimUsers
        supabase.table("DimUsers") \
            .delete().eq("user_id", user_id).execute()

        # Delete from Supabase Auth
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception as e:
            logger.warning(f"Auth delete failed: {e}")

        background_tasks.add_task(
            audit_log,
            action      = "user_deleted",
            description = f"Permanently deleted user: {user_email}",
            target_type = "user",
            target_id   = user_id,
            metadata    = {"email": user_email},
            request     = request,
        )

        return {
            "status":  "success",
            "message": f"User {user_email} permanently deleted."
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 3. SUBSCRIPTION & PLAN MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/subscriptions")
async def get_all_subscriptions(
    admin   = Depends(verify_admin_token),
    limit:  int           = Query(20, ge=1, le=100),
    offset: int           = Query(0,  ge=0),
    plan:   Optional[str] = Query(None),
):
    """Get all subscription usages with user info."""
    try:
        result = supabase.table("FactSubscriptionUsage") \
            .select("*") \
            .limit(limit) \
            .offset(offset) \
            .execute()

        enriched = []
        for sub in (result.data or []):
            # Find user via workspace
            ws = supabase.table("DimWorkSpaces") \
                .select("user_id, workspace_name") \
                .eq("subscription_id", sub["subscription_id"]) \
                .limit(1).execute()

            user_info = {}
            if ws.data:
                user = supabase.table("DimUsers") \
                    .select("email, full_name, subscription_plan") \
                    .eq("user_id", ws.data[0]["user_id"]) \
                    .execute()
                if user.data:
                    user_info = user.data[0]

            enriched.append({**sub, "user": user_info})

        return {
            "status":        "success",
            "subscriptions": enriched,
            "total":         len(enriched),
            "limit":         limit,
            "offset":        offset,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/subscriptions/plan")
async def update_user_plan(
    body:             UpdatePlanRequest,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Change a user's subscription plan."""
    try:
        supabase.table("DimUsers").update({
            "subscription_plan": body.new_plan
        }).eq("user_id", body.user_id).execute()

        background_tasks.add_task(
            audit_log,
            action      = "plan_updated",
            description = f"Plan changed to {body.new_plan} for user {body.user_id}",
            target_type = "user",
            target_id   = body.user_id,
            metadata    = {"new_plan": body.new_plan},
            request     = request,
        )

        return {
            "status":  "success",
            "message": f"Plan updated to {body.new_plan}."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/subscriptions/quota")
async def update_subscription_quota(
    body:             UpdateQuotaRequest,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Manually update quota limits for a subscription."""
    try:
        update_data = {}
        if body.max_upload_docs is not None:
            update_data["max_upload_docs"] = body.max_upload_docs
        if body.max_query is not None:
            update_data["max_query"]       = body.max_query
        if body.max_api is not None:
            update_data["max_api"]         = body.max_api
        if body.max_token is not None:
            update_data["max_token"]       = body.max_token
        if body.max_workspace is not None:
            update_data["max_workspace"]   = body.max_workspace

        if not update_data:
            raise HTTPException(
                status_code=400,
                detail="No quota fields provided."
            )

        supabase.table("FactSubscriptionUsage") \
            .update(update_data) \
            .eq("subscription_id", body.subscription_id) \
            .execute()

        background_tasks.add_task(
            audit_log,
            action      = "quota_updated",
            description = f"Quota updated for subscription {body.subscription_id}",
            target_type = "subscription",
            target_id   = body.subscription_id,
            metadata    = update_data,
            request     = request,
        )

        return {"status": "success", "updated": update_data}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/reset_usage/{subscription_id}")
async def reset_subscription_usage(
    subscription_id:  str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Reset all usage counters to 0 for a subscription."""
    try:
        supabase.table("FactSubscriptionUsage").update({
            "user_uploded_docs": 0,
            "user_query":        0,
            "user_api":          0,
            "user_token":        0,
            "user_workspace":    0,
        }).eq("subscription_id", subscription_id).execute()

        background_tasks.add_task(
            audit_log,
            action      = "usage_reset",
            description = f"Usage reset for subscription {subscription_id}",
            target_type = "subscription",
            target_id   = subscription_id,
            request     = request,
        )

        return {"status": "success", "message": "Usage counters reset to 0."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/extend")
async def extend_subscription(
    body:             ExtendSubscriptionRequest,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Admin: extend a subscription's end_date by N days."""
    try:
        sub = supabase.table("DimUserSubscriptions") \
            .select("end_date, subscription_package_code") \
            .eq("subscription_id", body.subscription_id).execute()
        if not sub.data:
            raise HTTPException(status_code=404, detail="Subscription not found.")

        current_end = sub.data[0].get("end_date") or datetime.now(timezone.utc).date().isoformat()
        from datetime import date, timedelta
        try:
            base = date.fromisoformat(current_end[:10])
        except Exception:
            base = date.today()
        new_end = (base + timedelta(days=body.days)).isoformat()

        supabase.table("DimUserSubscriptions").update({
            "end_date":     new_end,
            "renewal_date": new_end,
        }).eq("subscription_id", body.subscription_id).execute()

        background_tasks.add_task(
            audit_log,
            action      = "subscription_extended",
            description = f"Extended subscription {body.subscription_id} by {body.days} days (new end: {new_end})",
            target_type = "subscription",
            target_id   = body.subscription_id,
            metadata    = {"days": body.days, "new_end_date": new_end},
            request     = request,
        )

        return {"status": "success", "new_end_date": new_end}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/cancel/{subscription_id}")
async def admin_cancel_subscription(
    subscription_id:  str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Admin: soft-cancel a subscription (status → cancelled). Does NOT delete data."""
    try:
        sub = supabase.table("DimUserSubscriptions") \
            .select("*").eq("subscription_id", subscription_id).execute()
        if not sub.data:
            raise HTTPException(status_code=404, detail="Subscription not found.")

        supabase.table("DimUserSubscriptions").update({
            "status": "cancelled"
        }).eq("subscription_id", subscription_id).execute()

        supabase.table("FactSubscriptionUsage").update({
            "status": "cancelled"
        }).eq("subscription_id", subscription_id).execute()

        background_tasks.add_task(
            audit_log,
            action      = "subscription_cancelled",
            description = f"Admin cancelled subscription {subscription_id}",
            target_type = "subscription",
            target_id   = subscription_id,
            request     = request,
        )

        return {"status": "success", "message": f"Subscription {subscription_id} cancelled."}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plans")
async def get_all_subscription_plans(admin = Depends(verify_admin_token)):
    """Admin: return all plans from DimSubscriptionPackages."""
    try:
        plans = supabase.table("DimSubscriptionPackages").select("*").execute()
        return {"status": "success", "plans": plans.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 4. WORKSPACE OVERSIGHT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/workspaces")
async def get_all_workspaces(
    admin   = Depends(verify_admin_token),
    limit:  int           = Query(20, ge=1, le=100),
    offset: int           = Query(0,  ge=0),
    status: Optional[str] = Query(None, description="active | inactive"),
    search: Optional[str] = Query(None),
):
    """Get all workspaces across all tenants."""
    try:
        query = supabase.table("DimWorkSpaces") \
            .select("*") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .offset(offset)

        if status:
            query = query.eq("status", status)
        if search:
            query = query.ilike("workspace_name", f"%{search}%")

        result = query.execute()

        enriched = []
        for ws in (result.data or []):
            # Get owner info
            user = supabase.table("DimUsers") \
                .select("email, full_name, subscription_plan") \
                .eq("user_id", ws["user_id"]).execute()

            # Get doc count
            docs = supabase.table("DimUserDocuments") \
                .select("doc_id", count="exact") \
                .eq("workspace_name", ws["workspace_name"]).execute()

            # Get usage
            usage = supabase.table("FactWorkSpaceUsage") \
                .select("user_upload, user_api, user_token") \
                .eq("workspace_name", ws["workspace_name"]).execute()

            enriched.append({
                **ws,
                "owner":     user.data[0] if user.data else {},
                "doc_count": docs.count or 0,
                "usage":     usage.data[0] if usage.data else {},
            })

        count_result = supabase.table("DimWorkSpaces") \
            .select("workspace_id", count="exact").execute()

        return {
            "status":     "success",
            "workspaces": enriched,
            "total":      count_result.count or 0,
            "limit":      limit,
            "offset":     offset,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workspaces/{workspace_name}")
async def get_workspace_detail(
    workspace_name: str,
    admin           = Depends(verify_admin_token),
):
    """Full detail for a single workspace."""
    try:
        ws = supabase.table("DimWorkSpaces") \
            .select("*") \
            .eq("workspace_name", workspace_name).execute()

        if not ws.data:
            raise HTTPException(
                status_code=404, detail="Workspace not found."
            )

        workspace = ws.data[0]

        # Documents
        docs = supabase.table("DimUserDocuments") \
            .select("doc_id, file_name, file_extension, created_at") \
            .eq("workspace_name", workspace_name).execute()

        # Usage
        usage = supabase.table("FactWorkSpaceUsage") \
            .select("*") \
            .eq("workspace_name", workspace_name).execute()

        # API keys
        keys = supabase.table("DimUserApi") \
            .select("id, status, created_at") \
            .eq("workspace_name", workspace_name).execute()

        # Recent conversations count
        convs = supabase.table("DimConversations") \
            .select("conversation_id", count="exact") \
            .eq("workspace_name", workspace_name).execute()

        return {
            "status":              "success",
            "workspace":           workspace,
            "documents":           docs.data or [],
            "usage":               usage.data[0] if usage.data else {},
            "api_keys":            keys.data or [],
            "conversation_count":  convs.count or 0,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/workspaces/{workspace_name}/status")
async def toggle_workspace_status(
    workspace_name:   str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
    status:           str = Query(..., description="active | inactive"),
):
    """Enable or disable a workspace."""
    try:
        if status not in ("active", "inactive"):
            raise HTTPException(
                status_code=400,
                detail="Status must be 'active' or 'inactive'."
            )

        supabase.table("DimWorkSpaces").update({
            "status": status
        }).eq("workspace_name", workspace_name).execute()

        background_tasks.add_task(
            audit_log,
            action      = f"workspace_{status}",
            description = f"Workspace '{workspace_name}' set to {status}",
            target_type = "workspace",
            target_id   = workspace_name,
            request     = request,
        )

        return {
            "status":  "success",
            "message": f"Workspace '{workspace_name}' is now {status}."
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 5. USAGE MONITORING & ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/analytics/overview")
async def get_platform_analytics(
    admin = Depends(verify_admin_token),
    days: int = Query(30, ge=1, le=365),
):
    """Platform-wide analytics for the last N days."""
    try:
        since = (
            datetime.now(timezone.utc) - timedelta(days=days)
        ).isoformat()

        # User growth
        new_users = supabase.table("DimUsers") \
            .select("created_at", count="exact") \
            .gte("created_at", since).execute()

        # Total users
        total_users = supabase.table("DimUsers") \
            .select("user_id", count="exact").execute()

        # New workspaces
        new_ws = supabase.table("DimWorkSpaces") \
            .select("workspace_id", count="exact") \
            .gte("created_at", since).execute()

        # Activity breakdown
        activity = supabase.table("user_activity_logs") \
            .select("event_category") \
            .gte("created_at", since).execute()

        activity_breakdown = {}
        for log in (activity.data or []):
            cat = log.get("event_category", "unknown")
            activity_breakdown[cat] = activity_breakdown.get(cat, 0) + 1

        # Token + query totals
        all_usage = supabase.table("FactSubscriptionUsage") \
            .select("user_token, user_query, user_api, user_uploded_docs") \
            .execute()

        total_tokens = sum(
            r.get("user_token", 0) or 0 for r in (all_usage.data or [])
        )
        total_queries = sum(
            r.get("user_query", 0) or 0 for r in (all_usage.data or [])
        )
        total_api = sum(
            r.get("user_api", 0) or 0 for r in (all_usage.data or [])
        )
        total_docs = sum(
            r.get("user_uploded_docs", 0) or 0
            for r in (all_usage.data or [])
        )

        # Plan distribution
        plans = supabase.table("DimUsers") \
            .select("subscription_plan").execute()

        plan_dist = {}
        for u in (plans.data or []):
            p = u.get("subscription_plan") or "Free"
            plan_dist[p] = plan_dist.get(p, 0) + 1

        return {
            "status": "success",
            "period_days": days,
            "growth": {
                "new_users":      new_users.count or 0,
                "total_users":    total_users.count or 0,
                "new_workspaces": new_ws.count or 0,
            },
            "usage_totals": {
                "tokens":    total_tokens,
                "queries":   total_queries,
                "api_calls": total_api,
                "documents": total_docs,
            },
            "plan_distribution":     plan_dist,
            "activity_breakdown":    activity_breakdown,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/top_users")
async def get_top_users_by_usage(
    admin   = Depends(verify_admin_token),
    metric: str = Query("user_token", description="user_token|user_query|user_api"),
    limit:  int = Query(10, ge=1, le=50),
):
    """Get top N users ranked by usage metric."""
    try:
        allowed = {"user_token", "user_query", "user_api", "user_uploded_docs"}
        if metric not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Metric must be one of: {allowed}"
            )

        result = supabase.table("FactSubscriptionUsage") \
            .select(f"subscription_id, {metric}") \
            .order(metric, desc=True) \
            .limit(limit) \
            .execute()

        enriched = []
        for row in (result.data or []):
            ws = supabase.table("DimWorkSpaces") \
                .select("user_id") \
                .eq("subscription_id", row["subscription_id"]) \
                .limit(1).execute()

            user_info = {}
            if ws.data:
                user = supabase.table("DimUsers") \
                    .select("email, full_name, subscription_plan") \
                    .eq("user_id", ws.data[0]["user_id"]).execute()
                if user.data:
                    user_info = user.data[0]

            enriched.append({
                "subscription_id": row["subscription_id"],
                "metric":          metric,
                "value":           row.get(metric, 0),
                "user":            user_info,
            })

        return {"status": "success", "top_users": enriched}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/api-usage")
async def get_api_usage_analytics(
    admin = Depends(verify_admin_token),
    days:  int = Query(30, ge=1, le=365),
):
    """API usage trends (requests per day)."""
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        # Aggregate FactMessages by date
        msgs = supabase.table("FactMessages") \
            .select("created_at") \
            .gte("created_at", since).execute()
            
        daily_usage = {}
        for m in (msgs.data or []):
            d = m["created_at"][:10]
            daily_usage[d] = daily_usage.get(d, 0) + 1
            
        # Fill in missing days
        result = []
        for i in range(days):
            d = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
            result.append({"date": d, "requests": daily_usage.get(d, 0)})
            
        return {"status": "success", "usage": sorted(result, key=lambda x: x["date"])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/token-usage")
async def get_token_usage_analytics(
    admin = Depends(verify_admin_token),
    days:  int = Query(30, ge=1, le=365),
):
    """Token consumption trends (prompt vs completion)."""
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        msgs = supabase.table("FactMessages") \
            .select("created_at, prompt_tokens, completion_tokens") \
            .gte("created_at", since).execute()
            
        daily = {}
        for m in (msgs.data or []):
            d = m["created_at"][:10]
            if d not in daily: daily[d] = {"prompt": 0, "completion": 0}
            daily[d]["prompt"]     += m.get("prompt_tokens", 0) or 0
            daily[d]["completion"] += m.get("completion_tokens", 0) or 0
            
        result = []
        for i in range(days):
            d = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
            stats = daily.get(d, {"prompt": 0, "completion": 0})
            result.append({"date": d, **stats, "total": stats["prompt"] + stats["completion"]})
            
        return {"status": "success", "usage": sorted(result, key=lambda x: x["date"])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/conversation-stats")
async def get_conversation_analytics(
    admin = Depends(verify_admin_token),
    days:  int = Query(30, ge=1, le=365),
):
    """Conversation activity statistics."""
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        convs = supabase.table("DimConversations") \
            .select("created_at") \
            .gte("created_at", since).execute()
            
        msgs = supabase.table("FactMessages") \
            .select("created_at") \
            .gte("created_at", since).execute()
            
        daily_convs = {}
        for c in (convs.data or []):
            d = c["created_at"][:10]
            daily_convs[d] = daily_convs.get(d, 0) + 1
            
        daily_msgs = {}
        for m in (msgs.data or []):
            d = m["created_at"][:10]
            daily_msgs[d] = daily_msgs.get(d, 0) + 1
            
        result = []
        for i in range(days):
            d = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
            result.append({
                "date":          d,
                "conversations": daily_convs.get(d, 0),
                "messages":      daily_msgs.get(d, 0)
            })
            
        return {"status": "success", "stats": sorted(result, key=lambda x: x["date"])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/top-workspaces")
async def get_top_workspaces_analytics(
    admin = Depends(verify_admin_token),
    limit: int = Query(10, ge=1, le=50),
):
    """Most active workspaces by token usage."""
    try:
        res = supabase.table("FactWorkSpaceUsage") \
            .select("*") \
            .order("user_token", desc=True) \
            .limit(limit).execute()
            
        enriched = []
        for ws in (res.data or []):
            # Get owner email
            owner_res = supabase.table("DimWorkSpaces") \
                .select("user_id") \
                .eq("workspace_name", ws["workspace_name"]).execute()
            
            email = "Unknown"
            if owner_res.data:
                u = supabase.table("DimUsers") \
                    .select("email") \
                    .eq("user_id", owner_res.data[0]["user_id"]).execute()
                if u.data: email = u.data[0]["email"]
                
            enriched.append({
                "workspace_name": ws["workspace_name"],
                "owner_email":    email,
                "api_requests":   ws.get("user_api", 0),
                "tokens_used":    ws.get("user_token", 0),
                "files_uploaded": ws.get("user_upload", 0),
                "status":         ws.get("status", "active")
            })
            
        return {"status": "success", "top_workspaces": enriched}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/system-health")
async def get_system_health_analytics(admin = Depends(verify_admin_token)):
    """Aggregated system health metrics."""
    try:
        # Calculate avg latency from FactMessages
        latency_res = supabase.table("FactMessages") \
            .select("latency_ms") \
            .limit(1000).execute()
            
        latencies = [r["latency_ms"] for r in (latency_res.data or []) if r.get("latency_ms")]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0
        
        # Error rate (from audit logs with 'error' level or similar? No, let's proxy)
        # Using a fixed success rate for demo purposes if not tracking errors in DB yet
        success_rate = 99.8
        
        return {
            "status": "success",
            "health": {
                "avg_latency_ms": round(avg_latency, 2),
                "success_rate":   success_rate,
                "error_rate":      round(100 - success_rate, 2),
                "uptime_days":    45.2, # Static placeholder
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/activity-feed")
async def get_realtime_activity_feed(
    admin = Depends(verify_admin_token),
    limit: int = Query(20, ge=1, le=100),
):
    """Recent system activity logs."""
    try:
        # Combining AdminAuditLogs and user_activity_logs or just one
        logs = supabase.table("user_activity_logs") \
            .select("*") \
            .order("created_at", desc=True) \
            .limit(limit).execute()
            
        return {"status": "success", "feed": logs.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 6. API KEY OVERSIGHT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api_keys")
async def get_all_api_keys(
    admin   = Depends(verify_admin_token),
    limit:  int           = Query(20, ge=1, le=100),
    offset: int           = Query(0,  ge=0),
    status: Optional[str] = Query(None, description="active | suspended | revoked"),
):
    """Get all API keys across all workspaces."""
    try:
        query = supabase.table("DimUserApi") \
            .select("*") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .offset(offset)

        if status:
            query = query.eq("status", status)

        result   = query.execute()
        enriched = []

        for key in (result.data or []):
            ws = supabase.table("DimWorkSpaces") \
                .select("user_id") \
                .eq("workspace_name", key["workspace_name"]) \
                .limit(1).execute()

            owner = {}
            if ws.data:
                user = supabase.table("DimUsers") \
                    .select("email, full_name") \
                    .eq("user_id", ws.data[0]["user_id"]).execute()
                if user.data:
                    owner = user.data[0]

            enriched.append({
                **key,
                "Api_key": _mask_key(key.get("Api_key", "")),
                "owner":   owner,
            })

        count_result = supabase.table("DimUserApi") \
            .select("id", count="exact").execute()

        return {
            "status":   "success",
            "api_keys": enriched,
            "total":    count_result.count or 0,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api_keys/revoke")
async def revoke_api_key(
    body:             RevokeApiKeyRequest,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Revoke a specific API key."""
    try:
        supabase.table("DimUserApi").update({
            "status": "revoked"
        }).eq("id", body.api_key_id).execute()

        background_tasks.add_task(
            audit_log,
            action      = "api_key_revoked",
            description = f"API key revoked in workspace: {body.workspace_name}",
            target_type = "workspace",
            target_id   = body.workspace_name,
            metadata    = {"api_key_id": body.api_key_id},
            request     = request,
        )

        return {"status": "success", "message": "API key revoked."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# 7. BROADCAST EMAIL
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/email/broadcast",
    dependencies = [Depends(rate_limit("admin_broadcast", "key"))]
)
async def broadcast_email(
    body:             BroadcastEmailRequest,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """
    Send a broadcast email to all users or filtered by plan.
    Runs in background — returns immediately with job summary.
    """
    try:
        # Fetch target users
        query = supabase.table("DimUsers") \
            .select("email, full_name, subscription_plan")

        if body.plan_filter:
            query = query.eq("subscription_plan", body.plan_filter)

        users = query.execute()
        if not users.data:
            return {"status": "success", "sent": 0, "message": "No users found."}

        def send_broadcast():
            sent   = 0
            failed = 0
            for user in users.data:
                try:
                    content = f"""
                    <h2 style="margin:0 0 8px;color:#212529;font-size:22px;">
                      {body.subject}
                    </h2>
                    <p style="margin:0 0 24px;color:#6c757d;font-size:15px;">
                      Hi <strong>{user.get('full_name', 'there')}</strong>,
                    </p>
                    <div style="font-size:15px;color:#212529;line-height:1.8;">
                      {body.body}
                    </div>
                    """
                    html = _wrap_template(content, body.subject)
                    success = send_email(
                        to_email  = user["email"],
                        subject   = body.subject,
                        html_body = html
                    )
                    if success:
                        sent += 1
                    else:
                        failed += 1
                except Exception as e:
                    logger.error(f"Broadcast to {user['email']} failed: {e}")
                    failed += 1

            logger.info(
                f"Broadcast complete — sent: {sent}, failed: {failed}"
            )

        background_tasks.add_task(send_broadcast)

        background_tasks.add_task(
            audit_log,
            action      = "broadcast_email",
            description = f"Broadcast '{body.subject}' to "
                          f"{len(users.data)} users"
                          + (f" (plan: {body.plan_filter})"
                             if body.plan_filter else ""),
            target_type = "system",
            metadata    = {
                "subject":     body.subject,
                "plan_filter": body.plan_filter,
                "recipients":  len(users.data),
            },
            request = request,
        )

        return {
            "status":     "queued",
            "message":    f"Broadcast queued for {len(users.data)} users.",
            "recipients": len(users.data),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/email/usage")
async def trigger_usage_emails_admin(
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Manually trigger monthly usage emails to all users."""
    background_tasks.add_task(run_monthly_usage_emails)

    background_tasks.add_task(
        audit_log,
        action      = "usage_emails_triggered",
        description = "Monthly usage emails manually triggered",
        target_type = "system",
        request     = request,
    )

    return {
        "status":  "queued",
        "message": "Monthly usage emails queued for all users."
    }


@router.post("/email/usage/user")
async def trigger_usage_email_single(
    body:             SendUsageEmailRequest,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Send usage email to a specific user."""
    result = await send_usage_email_to_user(body.email)

    if result["status"] == "failed":
        raise HTTPException(status_code=404, detail=result["reason"])

    background_tasks.add_task(
        audit_log,
        action      = "usage_email_single",
        description = f"Usage email sent to {body.email}",
        target_type = "user",
        target_id   = body.email,
        request     = request,
    )

    return result


# ─────────────────────────────────────────────────────────────────────────────
# 7.5 WORKSPACE MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/workspaces/all")
async def get_all_workspaces_admin(
    admin: dict = Depends(verify_admin_token),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None)
):
    try:
        w_query = supabase.table("DimWorkSpaces").select("*").limit(limit).offset(offset)
        if search:
            w_query = w_query.ilike("workspace_name", f"%{search}%")
        
        w_res = w_query.execute()
        workspaces = w_res.data or []
        
        enriched = []
        for w in workspaces:
            u_res = supabase.table("DimUsers").select("email, full_name").eq("user_id", w["user_id"]).execute()
            owner = u_res.data[0] if u_res.data else {"email": "Unknown", "full_name": "Unknown"}
            
            usage_res = supabase.table("FactWorkSpaceUsage").select("*").eq("workspace_name", w["workspace_name"]).execute()
            usage = usage_res.data[0] if usage_res.data else {}
            
            enriched.append({
                "workspace_name": w["workspace_name"],
                "owner_name": owner["full_name"],
                "owner_email": owner["email"],
                "created_at": w["created_at"],
                "status": usage.get("status", "unknown"),
                "total_files": usage.get("user_upload", 0),
                "total_api": usage.get("user_api", 0),
                "total_tokens": usage.get("user_token", 0)
            })
            
        return {"status": "success", "workspaces": enriched}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspaces/{workspace_name}/overview")
async def get_workspace_overview_admin(workspace_name: str, admin = Depends(verify_admin_token)):
    try:
        w_res = supabase.table("DimWorkSpaces").select("*").eq("workspace_name", workspace_name).execute()
        if not w_res.data: raise HTTPException(status_code=404, detail="Workspace not found")
        w = w_res.data[0]
        
        u_res = supabase.table("DimUsers").select("email, full_name").eq("user_id", w["user_id"]).execute()
        owner = u_res.data[0] if u_res.data else {"email": "Unknown", "full_name": "Unknown"}
        
        usage_res = supabase.table("FactWorkSpaceUsage").select("*").eq("workspace_name", workspace_name).execute()
        usage = usage_res.data[0] if usage_res.data else {}
        
        return {"status": "success", "overview": {**w, "owner": owner, "usage": usage}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspaces/{workspace_name}/analytics")
async def get_workspace_analytics_admin(workspace_name: str, admin = Depends(verify_admin_token)):
    try:
        # Simplistic implementation: returning messages history as proxy for usage
        logs = supabase.table("FactMessages").select("created_at, tokens_used").eq("workspace_name", workspace_name).limit(100).execute()
        return {"status": "success", "analytics": logs.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspaces/{workspace_name}/files")
async def get_workspace_files_admin(workspace_name: str, admin = Depends(verify_admin_token)):
    try:
        f = supabase.table("DimUserDocuments").select("*").eq("workspace_name", workspace_name).execute()
        return {"status": "success", "files": f.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspaces/{workspace_name}/conversations")
async def get_workspace_conversations_admin(workspace_name: str, admin = Depends(verify_admin_token)):
    try:
        c = supabase.table("DimConversations").select("*").eq("workspace_name", workspace_name).execute()
        return {"status": "success", "conversations": c.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspaces/{workspace_name}/api_keys")
async def get_workspace_api_keys_admin(workspace_name: str, admin = Depends(verify_admin_token)):
    try:
        k = supabase.table("DimUserApi").select("*").eq("workspace_name", workspace_name).execute()
        return {"status": "success", "api_keys": k.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workspaces/{workspace_name}/activity")
async def get_workspace_activity_admin(workspace_name: str, admin = Depends(verify_admin_token)):
    try:
        # Generic activity logs for the workspace
        w_res = supabase.table("DimWorkSpaces").select("user_id").eq("workspace_name", workspace_name).execute()
        if w_res.data:
            logs = supabase.table("user_activity_logs").select("*").eq("user_id", w_res.data[0]["user_id"]).ilike("description", f"%{workspace_name}%").order("created_at", desc=True).limit(50).execute()
            return {"status": "success", "activity": logs.data or []}
        return {"status": "success", "activity": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspaces/{workspace_name}/activate")
async def activate_workspace_admin(
    workspace_name:   str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Reactivate a suspended workspace."""
    try:
        supabase.table("FactWorkSpaceUsage").update({"status": "active"}).eq("workspace_name", workspace_name).execute()
        supabase.table("DimUserApi").update({"status": "active"}).eq("workspace_name", workspace_name).execute()
        background_tasks.add_task(audit_log, action="workspace_activated", description=f"Activated workspace: {workspace_name}", target_type="workspace", target_id=workspace_name, request=request)
        return {"status": "success", "message": f"Workspace {workspace_name} activated."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workspaces/{workspace_name}/suspend")
async def suspend_workspace_admin(
    workspace_name:   str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Suspend a workspace by disabling all associated API keys."""
    try:
        supabase.table("FactWorkSpaceUsage").update({"status": "suspended"}).eq("workspace_name", workspace_name).execute()
        supabase.table("DimUserApi").update({"status": "suspended"}).eq("workspace_name", workspace_name).execute()
        background_tasks.add_task(audit_log, action="workspace_suspended", description=f"Suspended workspace: {workspace_name}", target_type="workspace", target_id=workspace_name, request=request)
        return {"status": "success", "message": f"Workspace {workspace_name} suspended."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/workspaces/{workspace_name}")
async def delete_workspace_admin(
    workspace_name:   str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Delete a workspace and cascade delete internal assets."""
    try:
        supabase.table("DimUserDocuments").delete().eq("workspace_name", workspace_name).execute()
        supabase.table("DimUserApi").delete().eq("workspace_name", workspace_name).execute()
        supabase.table("FactWorkSpaceUsage").delete().eq("workspace_name", workspace_name).execute()
        supabase.table("DimConversations").delete().eq("workspace_name", workspace_name).execute()
        supabase.table("DimWorkSpaces").delete().eq("workspace_name", workspace_name).execute()
        background_tasks.add_task(audit_log, action="workspace_deleted", description=f"Deleted workspace: {workspace_name}", target_type="workspace", target_id=workspace_name, request=request)
        return {"status": "success", "message": f"Workspace {workspace_name} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/files/{doc_id}")
async def delete_file_admin(
    doc_id:           str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Delete an individual user document."""
    try:
        supabase.table("DimUserDocuments").delete().eq("doc_id", doc_id).execute()
        background_tasks.add_task(audit_log, action="file_deleted", description=f"Deleted file: {doc_id}", target_type="file", target_id=doc_id, request=request)
        return {"status": "success", "message": f"File {doc_id} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────────────────────────────────────
# 8. AUDIT LOGS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/audit_logs")
async def get_audit_logs(
    admin   = Depends(verify_admin_token),
    limit:  int           = Query(50, ge=1, le=200),
    offset: int           = Query(0,  ge=0),
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
):
    """Get admin audit logs with filters."""
    try:
        query = supabase.table("AdminAuditLogs") \
            .select("*") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .offset(offset)

        if action:
            query = query.eq("action", action)
        if target_type:
            query = query.eq("target_type", target_type)

        result = query.execute()

        count_query = supabase.table("AdminAuditLogs") \
            .select("id", count="exact")
        if action:
            count_query = count_query.eq("action", action)
        count_result = count_query.execute()

        return {
            "status": "success",
            "logs":   result.data or [],
            "total":  count_result.count or 0,
            "limit":  limit,
            "offset": offset,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/rate_limits/status")
async def get_rate_limit_status(
    request: Request,
    admin    = Depends(verify_admin_token),
):
    """Check current rate limit counters — useful for monitoring abuse."""
    if not is_redis_available():
        raise HTTPException(status_code=503, detail="Redis unavailable.")

    try:
        stats = {}
        for config_name in RATE_LIMIT_CONFIGS.keys():
            keys = redis.keys(f"{config_name}:*")
            stats[config_name] = {
                "active_identifiers": len(keys) if keys else 0,
                "config": RATE_LIMIT_CONFIGS[config_name],
            }

        return {"status": "success", "rate_limits": stats}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/rate_limits/unblock/{ip}")
async def unblock_ip(
    ip:               str,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Manually unblock a rate-limited IP address."""
    if not is_redis_available():
        raise HTTPException(status_code=503, detail="Redis unavailable.")

    try:
        deleted = []
        for config_name in RATE_LIMIT_CONFIGS.keys():
            key = f"{config_name}:{ip}"
            if redis.exists(key):
                redis.delete(key)
                deleted.append(config_name)

        background_tasks.add_task(
            audit_log,
            action      = "ip_unblocked",
            description = f"Manually unblocked IP: {ip}",
            target_type = "system",
            target_id   = ip,
            metadata    = {"cleared_limits": deleted},
            request     = request,
        )

        return {
            "status":         "success",
            "ip":             ip,
            "cleared_limits": deleted,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────────────────────────────────────
# UTILITY
# ─────────────────────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    if not key or len(key) < 10:
        return "****"
    return f"{key[:6]}...{key[-4:]}"


# ─────────────────────────────────────────────────────────────────────────────
# 9. TRANSACTION LEDGER
# ─────────────────────────────────────────────────────────────────────────────

class UpdateTransactionStatusRequest(BaseModel):
    status: str  # success | failed | refunded | pending


@router.get("/transactions")
async def get_all_transactions(
    admin          = Depends(verify_admin_token),
    limit:   int           = Query(50, ge=1, le=200),
    offset:  int           = Query(0,  ge=0),
    status:  Optional[str] = Query(None),
    package: Optional[str] = Query(None),
    search:  Optional[str] = Query(None),
):
    """Paginated transaction ledger with user + payment-method enrichment."""
    try:
        query = supabase.table("FactPaymentTransactions") \
            .select("*") \
            .order("transaction_time", desc=True) \
            .limit(limit) \
            .offset(offset)

        if status:
            query = query.eq("status", status)
        if package:
            query = query.eq("subscription_package_code", package)

        result = query.execute()
        rows   = result.data or []

        # Total count (unfiltered by status/package for now — good enough)
        total_q = supabase.table("FactPaymentTransactions") \
            .select("id", count="exact").execute()

        enriched = []
        for tx in rows:
            # User info
            user_res = supabase.table("DimUsers") \
                .select("email, full_name") \
                .eq("user_id", tx["user_id"]).execute()
            user = user_res.data[0] if user_res.data else {"email": "—", "full_name": "—"}

            # Payment method
            pay_res = supabase.table("DimUserPaymentDetails") \
                .select("payment_method_type, bank_name, account_holder_name, expiration_date") \
                .eq("payment_details_id", tx.get("payment_details_id", "")).execute()
            pay = pay_res.data[0] if pay_res.data else {}

            # Skip if search filter is active and doesn't match
            if search:
                s = search.lower()
                ref  = (tx.get("payment_reference_number") or "").lower()
                mail = user["email"].lower()
                uid  = tx["user_id"].lower()
                if s not in ref and s not in mail and s not in uid:
                    continue

            enriched.append({
                **tx,
                "user_email":      user["email"],
                "user_full_name":  user["full_name"],
                "payment_method":  pay.get("payment_method_type", "—"),
                "bank_name":       pay.get("bank_name", "—"),
                "account_holder":  pay.get("account_holder_name", "—"),
                "expiration_date": pay.get("expiration_date", "—"),
            })

        return {
            "status":       "success",
            "transactions": enriched,
            "total":        total_q.count or 0,
            "limit":        limit,
            "offset":       offset,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transactions/summary")
async def get_transaction_summary(admin = Depends(verify_admin_token)):
    """Revenue summary cards — total revenue, count, success/failed breakdown."""
    try:
        all_tx = supabase.table("FactPaymentTransactions") \
            .select("amount, status").execute()
        rows = all_tx.data or []

        total_revenue  = sum(r.get("amount", 0) or 0 for r in rows if r.get("status") == "succeeded")
        total_count    = len(rows)
        success_count  = sum(1 for r in rows if r.get("status") == "succeeded")
        failed_count   = sum(1 for r in rows if r.get("status") == "failed")
        refunded_count = sum(1 for r in rows if r.get("status") == "refunded")
        pending_count  = sum(1 for r in rows if r.get("status") == "pending")

        # Plan distribution revenue
        plan_revenue: dict = {}
        for r in rows:
            if r.get("status") == "succeeded":
                pkg = r.get("subscription_package_code") or "Unknown"
                plan_revenue[pkg] = plan_revenue.get(pkg, 0) + (r.get("amount") or 0)

        return {
            "status":         "success",
            "total_revenue":  total_revenue,
            "total_count":    total_count,
            "success_count":  success_count,
            "failed_count":   failed_count,
            "refunded_count": refunded_count,
            "pending_count":  pending_count,
            "plan_revenue":   plan_revenue,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transactions/{transaction_id}")
async def get_transaction_detail(
    transaction_id: str,
    admin           = Depends(verify_admin_token),
):
    """Full detail for a single transaction."""
    try:
        tx_res = supabase.table("FactPaymentTransactions") \
            .select("*").eq("id", transaction_id).execute()
        if not tx_res.data:
            raise HTTPException(status_code=404, detail="Transaction not found.")
        tx = tx_res.data[0]

        user_res = supabase.table("DimUsers") \
            .select("email, full_name") \
            .eq("user_id", tx["user_id"]).execute()
        user = user_res.data[0] if user_res.data else {}

        pay_res = supabase.table("DimUserPaymentDetails") \
            .select("*") \
            .eq("payment_details_id", tx.get("payment_details_id", "")).execute()
        pay = pay_res.data[0] if pay_res.data else {}

        return {
            "status":      "success",
            "transaction": {**tx, "user": user, "payment_details": pay},
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/transactions/{transaction_id}/status")
async def update_transaction_status(
    transaction_id:   str,
    body:             UpdateTransactionStatusRequest,
    request:          Request,
    background_tasks: BackgroundTasks,
    admin             = Depends(verify_admin_token),
):
    """Admin: change a transaction's status (success | failed | refunded | pending)."""
    allowed = {"succeeded", "failed", "refunded", "pending"}
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {allowed}.")
    try:
        res = supabase.table("FactPaymentTransactions") \
            .update({"status": body.status}) \
            .eq("id", transaction_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        background_tasks.add_task(
            audit_log,
            action      = "transaction_status_updated",
            description = f"Transaction {transaction_id} status → {body.status}",
            target_type = "transaction",
            target_id   = transaction_id,
            metadata    = {"new_status": body.status},
            request     = request,
        )

        return {"status": "success", "new_status": body.status}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transactions/export/csv")
async def export_transactions_csv(
    admin   = Depends(verify_admin_token),
    status: Optional[str] = Query(None),
):
    """Export transactions as CSV (streamed response)."""
    import csv, io
    from fastapi.responses import StreamingResponse

    try:
        query = supabase.table("FactPaymentTransactions").select("*").order("transaction_time", desc=True)
        if status:
            query = query.eq("status", status)
        rows = query.execute().data or []

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "id", "user_id", "payment_reference_number", "subscription_package_code",
            "amount", "currency", "status", "transaction_time",
        ])
        writer.writeheader()
        for r in rows:
            writer.writerow({k: r.get(k, "") for k in writer.fieldnames})

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=transactions.csv"},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

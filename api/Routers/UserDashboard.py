from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from Integrations.pinecone_client import supabase
from datetime import datetime, timedelta, timezone
import logging
from Services.auth_dependency import get_current_user, verify_ownership

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ─────────────────────────────────────────────────────────────────────────────
# SHARED HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_user_or_404(user_id: str) -> dict:
    """
    Returns user if found, otherwise 404.
    Also verifies ownership if user is not admin.
    """

    result = supabase.table("DimUsers") \
        .select("*") \
        .eq("user_id", user_id) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found.")
    return result.data[0]


def get_workspace_or_404(workspace_name: str) -> dict:
    result = supabase.table("DimWorkSpaces") \
        .select("*") \
        .eq("workspace_name", workspace_name) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return result.data[0]


def calculate_percentage(used: int, total: int) -> float:
    if not total or total <= 0:
        return 0.0
    return round(min((used / total) * 100, 100), 1)


# ─────────────────────────────────────────────────────────────────────────────
# USER DASHBOARD ROUTES
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. User Overview ──────────────────────────────────────────────────────────
@router.get("/user/overview/{user_id}")
async def get_user_overview(user_id: str, current_user  = Depends(get_current_user)):
    """
    Main user dashboard overview.
    Returns profile, subscription, workspace count and subscription usage.
    """
    verify_ownership(current_user, user_id)

    try:
        user = get_user_or_404(user_id)

        # Get workspaces
        workspaces = supabase.table("DimWorkSpaces") \
            .select("workspace_name, status, subscription_id, created_at") \
            .eq("user_id", user_id) \
            .execute()

        workspace_list  = workspaces.data or []
        total_workspaces = len(workspace_list)
        active_workspaces = sum(
            1 for w in workspace_list if w.get("status") == "active"
        )

        # Get subscription usage
        sub_usage = None
        if workspace_list:
            sub_id = workspace_list[0].get("subscription_id")
            if sub_id:
                usage_result = supabase.table("FactSubscriptionUsage") \
                    .select("*") \
                    .eq("subscription_id", sub_id) \
                    .execute()
                sub_usage = usage_result.data[0] if usage_result.data else None

        # Build usage summary
        usage_summary = {}
        if sub_usage:
            usage_summary = {
                "documents": {
                    "used":       sub_usage.get("user_uploded_docs", 0) or 0,
                    "limit":      sub_usage.get("max_upload_docs", 0) or 0,
                    "percentage": calculate_percentage(
                        sub_usage.get("user_uploded_docs", 0) or 0,
                        sub_usage.get("max_upload_docs", 0) or 0
                    )
                },
                "queries": {
                    "used":       sub_usage.get("user_query", 0) or 0,
                    "limit":      sub_usage.get("max_query", 0) or 0,
                    "percentage": calculate_percentage(
                        sub_usage.get("user_query", 0) or 0,
                        sub_usage.get("max_query", 0) or 0
                    )
                },
                "api_calls": {
                    "used":       sub_usage.get("user_api", 0) or 0,
                    "limit":      sub_usage.get("max_api", 0) or 0,
                    "percentage": calculate_percentage(
                        sub_usage.get("user_api", 0) or 0,
                        sub_usage.get("max_api", 0) or 0
                    )
                },
                "tokens": {
                    "used":       sub_usage.get("user_token", 0) or 0,
                    "limit":      sub_usage.get("max_token", 0) or 0,
                    "percentage": calculate_percentage(
                        sub_usage.get("user_token", 0) or 0,
                        sub_usage.get("max_token", 0) or 0
                    )
                },
                "workspaces": {
                    "used":       sub_usage.get("user_workspace", 0) or 0,
                    "limit":      sub_usage.get("max_workspace", 0) or 0,
                    "percentage": calculate_percentage(
                        sub_usage.get("user_workspace", 0) or 0,
                        sub_usage.get("max_workspace", 0) or 0
                    )
                },
            }

        return {
            "status": "success",
            "profile": {
                "full_name":         user.get("full_name"),
                "email":             user.get("email"),
                "company_name":      user.get("company_name"),
                "subscription_plan": user.get("subscription_plan"),
                "member_since":      user.get("created_at"),
                "last_login":        user.get("last_login"),
            },
            "workspace_stats": {
                "total":  total_workspaces,
                "active": active_workspaces,
            },
            "usage_summary": usage_summary,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"User overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── 2. User Workspace Usage ───────────────────────────────────────────────────
@router.get("/user/workspace_usage/{user_id}")
async def get_user_workspace_usage(user_id: str, current_user  = Depends(get_current_user)):
    """
    Returns per-workspace usage breakdown for the user.
    """
    verify_ownership(current_user, user_id)
    try:
        workspaces = supabase.table("DimWorkSpaces") \
            .select("workspace_name, status, created_at") \
            .eq("user_id", user_id) \
            .execute()

        if not workspaces.data:
            return {"status": "success", "workspaces": []}

        workspace_data = []
        for ws in workspaces.data:
            ws_name = ws["workspace_name"]

            # Get workspace usage
            usage_result = supabase.table("FactWorkSpaceUsage") \
                .select("*") \
                .eq("workspace_name", ws_name) \
                .execute()

            usage = usage_result.data[0] if usage_result.data else {}

            # Get file count
            files_result = supabase.table("DimUserDocuments") \
                .select("doc_id") \
                .eq("workspace_name", ws_name) \
                .execute()

            workspace_data.append({
                "workspace_name": ws_name,
                "status":         ws.get("status"),
                "created_at":     ws.get("created_at"),
                "file_count":     len(files_result.data or []),
                "usage": {
                    "uploads": {
                        "used":       usage.get("user_upload", 0) or 0,
                        "limit":      usage.get("max_upload", 0) or 0,
                        "percentage": calculate_percentage(
                            usage.get("user_upload", 0) or 0,
                            usage.get("max_upload", 0) or 0
                        )
                    },
                    "api_calls": {
                        "used":       usage.get("user_api", 0) or 0,
                        "limit":      usage.get("max_api", 0) or 0,
                        "percentage": calculate_percentage(
                            usage.get("user_api", 0) or 0,
                            usage.get("max_api", 0) or 0
                        )
                    },
                    "tokens": {
                        "used":       usage.get("user_token", 0) or 0,
                        "limit":      usage.get("max_token", 0) or 0,
                        "percentage": calculate_percentage(
                            usage.get("user_token", 0) or 0,
                            usage.get("max_token", 0) or 0
                        )
                    },
                }
            })

        return {"status": "success", "workspaces": workspace_data}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 3. User Activity Logs ─────────────────────────────────────────────────────
@router.get("/user/activity/{user_id}")
async def get_user_activity(
    user_id:  str,
    category: Optional[str] = Query(None, description="auth|file|workspace|billing|api"),
    limit:    int = Query(20, ge=1, le=100),
    offset:   int = Query(0, ge=0),
    current_user  = Depends(get_current_user)):
    """
    Returns paginated activity logs for a user.
    Optional filter by category.
    """
    verify_ownership(current_user, user_id)
    try:
        query = supabase.table("user_activity_logs") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .offset(offset)

        if category:
            query = query.eq("event_category", category)

        result = query.execute()

        # Get total count
        count_query = supabase.table("user_activity_logs") \
            .select("id", count="exact") \
            .eq("user_id", user_id)
        if category:
            count_query = count_query.eq("event_category", category)
        count_result = count_query.execute()

        return {
            "status": "success",
            "logs":   result.data or [],
            "total":  count_result.count or 0,
            "limit":  limit,
            "offset": offset,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 4. User API Key Stats ─────────────────────────────────────────────────────
@router.get("/user/api_keys/{user_id}")
async def get_user_api_keys(user_id: str,current_user  = Depends(get_current_user)):
    """
    Returns all API keys for the user with usage stats per key.
    """
    verify_ownership(current_user, user_id)
    try:
        # Get workspaces for user
        workspaces = supabase.table("DimWorkSpaces") \
            .select("workspace_name") \
            .eq("user_id", user_id) \
            .execute()

        if not workspaces.data:
            return {"status": "success", "api_keys": []}

        workspace_names = [w["workspace_name"] for w in workspaces.data]
        api_keys_data   = []

        for ws_name in workspace_names:
            keys_result = supabase.table("DimUserApi") \
                .select("*") \
                .eq("workspace_name", ws_name) \
                .execute()

            for key in (keys_result.data or []):
                api_keys_data.append({
                    "api_key_id":      key.get("id"),
                    "workspace_name":  ws_name,
                    "api_key_preview": mask_api_key(key.get("Api_key", "")),
                    "status":          key.get("status", "active"),
                    "created_at":      key.get("created_at"),
                    "last_used":       key.get("last_used"),
                })

        return {
            "status":   "success",
            "api_keys": api_keys_data,
            "total":    len(api_keys_data),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN DASHBOARD ROUTES
# ─────────────────────────────────────────────────────────────────────────────

# # ── 5. Admin Platform Overview ────────────────────────────────────────────────
# @router.get("/admin/overview")
# async def get_admin_overview():
#     """
#     Admin dashboard main overview.
#     Returns platform-wide stats across all tenants.
#     """
#     try:
#         # Total users
#         users_result = supabase.table("DimUsers") \
#             .select("user_id", count="exact") \
#             .execute()

#         # Total workspaces
#         ws_result = supabase.table("DimWorkSpaces") \
#             .select("workspace_id", count="exact") \
#             .execute()

#         # Active workspaces
#         active_ws = supabase.table("DimWorkSpaces") \
#             .select("workspace_id", count="exact") \
#             .eq("status", "active") \
#             .execute()

#         # Total documents
#         docs_result = supabase.table("DimUserDocuments") \
#             .select("doc_id", count="exact") \
#             .execute()

#         # New users this month
#         month_start = datetime.now(timezone.utc).replace(
#             day=1, hour=0, minute=0, second=0
#         ).isoformat()

#         new_users = supabase.table("DimUsers") \
#             .select("user_id", count="exact") \
#             .gte("created_at", month_start) \
#             .execute()

#         # Plan distribution
#         plan_result = supabase.table("DimUsers") \
#             .select("subscription_plan") \
#             .execute()

#         plan_distribution = {}
#         for user in (plan_result.data or []):
#             plan = user.get("subscription_plan", "Free") or "Free"
#             plan_distribution[plan] = plan_distribution.get(plan, 0) + 1

#         # Total token usage across all subscriptions
#         token_result = supabase.table("FactSubscriptionUsage") \
#             .select("user_token") \
#             .execute()

#         total_tokens = sum(
#             row.get("user_token", 0) or 0
#             for row in (token_result.data or [])
#         )

#         return {
#             "status": "success",
#             "platform_stats": {
#                 "total_users":       users_result.count or 0,
#                 "total_workspaces":  ws_result.count or 0,
#                 "active_workspaces": active_ws.count or 0,
#                 "total_documents":   docs_result.count or 0,
#                 "new_users_month":   new_users.count or 0,
#                 "total_tokens_used": total_tokens,
#             },
#             "plan_distribution": plan_distribution,
#         }

#     except HTTPException:
#         raise
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# # ── 6. Admin All Users ────────────────────────────────────────────────────────
# @router.get("/admin/users")
# async def get_admin_all_users(
#     limit:  int = Query(20, ge=1, le=100),
#     offset: int = Query(0, ge=0),
#     plan:   Optional[str] = Query(None, description="Filter by plan"),
#     search: Optional[str] = Query(None, description="Search by name or email"),):
#     """
#     Returns paginated list of all users with usage summary.
#     Admin only.
#     """
#     try:
#         query = supabase.table("DimUsers") \
#             .select("user_id, email, full_name, subscription_plan, "
#                     "company_name, created_at, last_login") \
#             .order("created_at", desc=True) \
#             .limit(limit) \
#             .offset(offset)

#         if plan:
#             query = query.eq("subscription_plan", plan)

#         result       = query.execute()
#         users        = result.data or []
#         enriched     = []

#         for user in users:
#             user_id = user.get("user_id")

#             # Workspace count
#             ws_count = supabase.table("DimWorkSpaces") \
#                 .select("workspace_id", count="exact") \
#                 .eq("user_id", user_id) \
#                 .execute()

#             # Subscription usage
#             ws_data = supabase.table("DimWorkSpaces") \
#                 .select("subscription_id") \
#                 .eq("user_id", user_id) \
#                 .limit(1) \
#                 .execute()

#             token_used = 0
#             query_used = 0
#             if ws_data.data:
#                 sub_id = ws_data.data[0].get("subscription_id")
#                 if sub_id:
#                     usage = supabase.table("FactSubscriptionUsage") \
#                         .select("user_token, user_query") \
#                         .eq("subscription_id", sub_id) \
#                         .execute()
#                     if usage.data:
#                         token_used = usage.data[0].get("user_token", 0) or 0
#                         query_used = usage.data[0].get("user_query", 0) or 0

#             enriched.append({
#                 **user,
#                 "workspace_count": ws_count.count or 0,
#                 "token_used":      token_used,
#                 "query_used":      query_used,
#             })

#         # Total count
#         count_query = supabase.table("DimUsers") \
#             .select("user_id", count="exact")
#         if plan:
#             count_query = count_query.eq("subscription_plan", plan)
#         count_result = count_query.execute()

#         return {
#             "status": "success",
#             "users":  enriched,
#             "total":  count_result.count or 0,
#             "limit":  limit,
#             "offset": offset,
#         }

#     except HTTPException:
#         raise
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# # ── 7. Admin User Detail ──────────────────────────────────────────────────────
# @router.get("/admin/user/{user_id}")
# async def get_admin_user_detail(user_id: str):
#     """
#     Full detail for a single user — admin view.
#     Includes profile, all workspaces, usage and recent activity.
#     """
#     try:
#         user = get_user_or_404(user_id)

#         # Workspaces
#         workspaces = supabase.table("DimWorkSpaces") \
#             .select("*") \
#             .eq("user_id", user_id) \
#             .execute()

#         # Recent activity
#         activity = supabase.table("user_activity_logs") \
#             .select("event_category, event_type, description, "
#                     "created_at, event_status") \
#             .eq("user_id", user_id) \
#             .order("created_at", desc=True) \
#             .limit(10) \
#             .execute()

#         # Subscription usage
#         sub_usage = None
#         ws_list   = workspaces.data or []
#         if ws_list:
#             sub_id = ws_list[0].get("subscription_id")
#             if sub_id:
#                 usage = supabase.table("FactSubscriptionUsage") \
#                     .select("*") \
#                     .eq("subscription_id", sub_id) \
#                     .execute()
#                 sub_usage = usage.data[0] if usage.data else None

#         return {
#             "status":     "success",
#             "profile":    user,
#             "workspaces": ws_list,
#             "usage":      sub_usage,
#             "activity":   activity.data or [],
#         }

#     except HTTPException:
#         raise
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# # ── 8. Admin Platform Activity ────────────────────────────────────────────────
# @router.get("/admin/activity")
# async def get_admin_platform_activity(
#     category: Optional[str] = Query(None),
#     limit:    int = Query(50, ge=1, le=200),
#     offset:   int = Query(0, ge=0),):
#     """
#     Platform-wide activity logs across all users.
#     Admin only.
#     """
#     try:
#         query = supabase.table("user_activity_logs") \
#             .select("*") \
#             .order("created_at", desc=True) \
#             .limit(limit) \
#             .offset(offset)

#         if category:
#             query = query.eq("event_category", category)

#         result = query.execute()

#         count_query = supabase.table("user_activity_logs") \
#             .select("id", count="exact")
#         if category:
#             count_query = count_query.eq("event_category", category)
#         count_result = count_query.execute()

#         return {
#             "status": "success",
#             "logs":   result.data or [],
#             "total":  count_result.count or 0,
#             "limit":  limit,
#             "offset": offset,
#         }

#     except HTTPException:
#         raise
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# # ── 9. Admin Usage Stats ──────────────────────────────────────────────────────
# @router.get("/admin/usage_stats")
# async def get_admin_usage_stats():
#     """
#     Platform-wide aggregated usage statistics.
#     Admin only.
#     """
#     try:
#         # All subscription usages
#         all_usage = supabase.table("FactSubscriptionUsage") \
#             .select("*") \
#             .execute()

#         data = all_usage.data or []

#         total_tokens   = sum(r.get("user_token", 0) or 0 for r in data)
#         total_queries  = sum(r.get("user_query", 0) or 0 for r in data)
#         total_api      = sum(r.get("user_api", 0) or 0 for r in data)
#         total_docs     = sum(r.get("user_uploded_docs", 0) or 0 for r in data)

#         # Per plan breakdown
#         plan_result = supabase.table("DimUsers") \
#             .select("subscription_plan, user_id") \
#             .execute()

#         plans = {}
#         for u in (plan_result.data or []):
#             plan = u.get("subscription_plan", "Free") or "Free"
#             plans[plan] = plans.get(plan, 0) + 1

#         # Activity breakdown by category (last 30 days)
#         thirty_days_ago = (
#             datetime.now(timezone.utc) - timedelta(days=30)
#         ).isoformat()

#         activity_result = supabase.table("user_activity_logs") \
#             .select("event_category") \
#             .gte("created_at", thirty_days_ago) \
#             .execute()

#         activity_breakdown = {}
#         for log in (activity_result.data or []):
#             cat = log.get("event_category", "unknown")
#             activity_breakdown[cat] = activity_breakdown.get(cat, 0) + 1

#         return {
#             "status": "success",
#             "totals": {
#                 "tokens":    total_tokens,
#                 "queries":   total_queries,
#                 "api_calls": total_api,
#                 "documents": total_docs,
#             },
#             "plan_distribution":       plans,
#             "activity_last_30_days":   activity_breakdown,
#         }

#     except HTTPException:
#         raise
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# UTILITY
# ─────────────────────────────────────────────────────────────────────────────

def mask_api_key(key: str) -> str:
    """Show only first 6 and last 4 characters of API key."""
    if not key or len(key) < 10:
        return "****"
    return f"{key[:6]}...{key[-4:]}"
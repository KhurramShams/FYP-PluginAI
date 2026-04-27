import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Optional
from Integrations.pinecone_client import supabase
from Services.email_service import _wrap_template, _badge, _row, _now
from Services.email_service import send_email

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# DATA FETCHER — Fetches all users with their usage data
# ─────────────────────────────────────────────────────────────────────────────

def fetch_all_users_usage() -> List[Dict]:
    """
    Fetches every active user with their subscription usage
    and all workspace usages linked via DimWorkSpaces.
    """
    try:
        # Step 1: Get all users with subscription plan
        users_result = supabase.table("DimUsers") \
            .select("user_id, email, full_name, subscription_plan, company_name") \
            .execute()

        if not users_result.data:
            logger.info("No users found for monthly usage email.")
            return []

        all_users_data = []

        for user in users_result.data:
            user_id  = user.get("user_id")
            email    = user.get("email")
            if not user_id or not email:
                continue

            # Step 2: Get all workspaces for this user
            workspaces_result = supabase.table("DimWorkSpaces") \
                .select("workspace_name, subscription_id") \
                .eq("user_id", user_id) \
                .eq("status", "active") \
                .execute()

            workspaces = workspaces_result.data or []
            if not workspaces:
                continue

            # Step 3: Get subscription usage via subscription_id
            subscription_id = workspaces[0].get("subscription_id")
            sub_usage = None

            if subscription_id:
                sub_result = supabase.table("FactSubscriptionUsage") \
                    .select("*") \
                    .eq("subscription_id", subscription_id) \
                    .execute()
                sub_usage = sub_result.data[0] if sub_result.data else None

            # Step 4: Get workspace-level usage for each workspace
            workspace_usages = []
            for ws in workspaces:
                ws_name = ws.get("workspace_name")
                if not ws_name:
                    continue

                ws_usage_result = supabase.table("FactWorkSpaceUsage") \
                    .select("*") \
                    .eq("workspace_name", ws_name) \
                    .execute()

                if ws_usage_result.data:
                    ws_data = ws_usage_result.data[0]
                    workspace_usages.append({
                        "workspace_name": ws_name,
                        "user_upload":    ws_data.get("user_upload", 0) or 0,
                        "max_upload":     ws_data.get("max_upload", 0) or 0,
                        "user_api":       ws_data.get("user_api", 0) or 0,
                        "max_api":        ws_data.get("max_api", 0) or 0,
                        "user_token":     ws_data.get("user_token", 0) or 0,
                        "max_token":      ws_data.get("max_token", 0) or 0,
                        "status":         ws_data.get("status", "active"),
                    })

            all_users_data.append({
                "user_id":           user_id,
                "email":             email,
                "full_name":         user.get("full_name", "User"),
                "subscription_plan": user.get("subscription_plan", "Free"),
                "company_name":      user.get("company_name", ""),
                "sub_usage":         sub_usage,
                "workspace_usages":  workspace_usages,
            })

        logger.info(f"Fetched usage data for {len(all_users_data)} users.")
        return all_users_data

    except Exception as e:
        logger.error(f"Failed to fetch users usage: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# USAGE BAR — Visual progress bar for email
# ─────────────────────────────────────────────────────────────────────────────

def _usage_bar(used: int, total: int, label: str) -> str:
    """Renders a visual HTML progress bar."""
    if total <= 0:
        percent = 0
    else:
        percent = min(round((used / total) * 100), 100)

    # Color based on usage level
    if percent >= 90:
        color = "#ef4444"   # red — critical
    elif percent >= 70:
        color = "#f59e0b"   # amber — warning
    else:
        color = "#10b981"   # emerald — healthy

    used_fmt  = f"{used:,}"
    total_fmt = f"{total:,}" if total > 0 else "∞"

    return f"""
    <div style="margin-bottom:16px;">
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:6px;" border="0">
        <tr>
          <td style="font-size:13px;color:#f8fafc;font-weight:600;font-family:Arial,sans-serif;">{label}</td>
          <td align="right" style="font-size:12px;color:#94a3b8;font-family:Arial,sans-serif;">
            {used_fmt} / {total_fmt}
            &nbsp;<strong style="color:{color};">{percent}%</strong>
          </td>
        </tr>
      </table>
      <div style="background:#1e293b;border-radius:999px;height:8px;overflow:hidden;">
        <div style="background:{color};width:{percent}%;height:100%;
                    border-radius:999px;"></div>
      </div>
    </div>
    """



def _workspace_block(ws: Dict) -> str:
    """Renders a single workspace usage block."""
    status_color = "#10b981" if ws["status"] == "active" else "#94a3b8"
    status_bg    = "rgba(16,185,129,0.1)" if ws["status"] == "active" else "rgba(148,163,184,0.1)"
    return f"""
    <div style="background:#0a0a14;border-radius:12px;padding:24px;
                margin-bottom:16px;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0"
             style="margin-bottom:20px;">
        <tr>
          <td style="font-size:15px;font-weight:700;color:#f8fafc;font-family:Arial,sans-serif;">
            {ws['workspace_name']}
          </td>
          <td align="right">
            <span style="background:{status_bg};color:{status_color};
                         padding:4px 12px;border-radius:6px;
                         font-size:11px;font-weight:800;letter-spacing:1px;
                         text-transform:uppercase;font-family:Arial,sans-serif;">
              {ws['status']}
            </span>
          </td>
        </tr>
      </table>
      {_usage_bar(ws['user_upload'], ws['max_upload'], 'File Uploads')}
      {_usage_bar(ws['user_api'],    ws['max_api'],    'API Calls')}
      {_usage_bar(ws['user_token'],  ws['max_token'],  'Tokens Used')}
    </div>
    """



# ─────────────────────────────────────────────────────────────────────────────
# EMAIL TEMPLATE BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def build_usage_email(user_data: Dict) -> str:
    full_name         = user_data["full_name"]
    plan              = user_data["subscription_plan"] or "Free"
    sub               = user_data["sub_usage"] or {}
    workspace_usages  = user_data["workspace_usages"]
    month_year        = datetime.now(timezone.utc).strftime("%B %Y")

    # ── Subscription-level metrics ────────────────────────────────────────────
    sub_section = ""
    if sub:
        sub_section = f"""
        <h3 style="margin:24px 0 16px;color:#f8fafc;font-size:16px;font-weight:700;
                   border-bottom:1px solid #1e293b;padding-bottom:12px;font-family:Arial,sans-serif;">
          Subscription Overview
        </h3>
        {_usage_bar(sub.get('user_uploded_docs', 0) or 0,
                    sub.get('max_upload_docs',   0) or 0,
                    'Total Documents')}
        {_usage_bar(sub.get('user_query',  0) or 0,
                    sub.get('max_query',   0) or 0,
                    'Total Queries')}
        {_usage_bar(sub.get('user_api',    0) or 0,
                    sub.get('max_api',     0) or 0,
                    'Total API Calls')}
        {_usage_bar(sub.get('user_token',  0) or 0,
                    sub.get('max_token',   0) or 0,
                    'Total Tokens')}
        {_usage_bar(sub.get('user_workspace', 0) or 0,
                    sub.get('max_workspace',  0) or 0,
                    'Workspaces')}
        """

    # ── Workspace-level metrics ───────────────────────────────────────────────
    ws_section = ""
    if workspace_usages:
        ws_blocks = "".join(_workspace_block(ws) for ws in workspace_usages)
        ws_section = f"""
        <h3 style="margin:32px 0 16px;color:#f8fafc;font-size:16px;font-weight:700;
                   border-bottom:1px solid #1e293b;padding-bottom:12px;font-family:Arial,sans-serif;">
          Workspace Breakdown
        </h3>
        {ws_blocks}
        """

    # ── Renewal notice ────────────────────────────────────────────────────────
    renewal_notice = f"""
    <div style="background:rgba(124,109,240,0.1);border-radius:12px;padding:20px;
                margin-top:24px;border-left:4px solid #7c6df0;">
      <p style="margin:0;font-size:14px;color:#a89ff5;line-height:1.5;font-family:Arial,sans-serif;">
        Your usage resets on the <strong style="color:#f8fafc;">1st of next month</strong>.<br>
        Need more capacity?
        <a href="https://pluginai.space/upgrade"
           style="color:#7c6df0;font-weight:600;text-decoration:none;">Upgrade your plan &rarr;</a>
      </p>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <a href="https://pluginai.space/app/dashboard"
         style="display:inline-block;background:#7c6df0;color:#ffffff;
                padding:14px 32px;border-radius:8px;text-decoration:none;
                font-family:Arial,sans-serif;font-size:14px;font-weight:600;
                box-shadow:0 0 20px rgba(124,109,240,0.3);">View Dashboard &rarr;</a>
    </div>
    """

    content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:24px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Monthly Usage Report
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      Hi <strong style="color:#f8fafc;">{full_name}</strong>, here is your usage summary for
      <strong style="color:#f8fafc;">{month_year}</strong>.
    </p>
    <div style="margin-bottom:32px;">
      {_badge('#7c6df0', plan.upper())} {_badge('#3b82f6', month_year.upper())}
    </div>
    {sub_section}
    {ws_section}
    {renewal_notice}
    """

    return _wrap_template(content, f"Monthly Usage Report — {month_year}")


# ─────────────────────────────────────────────────────────────────────────────
# SEND MONTHLY USAGE EMAIL — per user
# ─────────────────────────────────────────────────────────────────────────────

def send_monthly_usage_email(user_data: Dict) -> None:
    """
    Build and send monthly usage email for a single user.
    Call via BackgroundTasks or scheduler.
    """
    try:
        email    = user_data["email"]
        month    = datetime.now(timezone.utc).strftime("%B %Y")
        html     = build_usage_email(user_data)

        success = send_email(
            to_email  = email,
            subject   = f"📈 Your {month} Usage Report — Plugin AI",
            html_body = html
        )

        if success:
            logger.info(f"Monthly usage email sent to {email}")
        else:
            logger.error(f"Failed to send usage email to {email}")

    except Exception as e:
        logger.error(f"send_monthly_usage_email error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULER — Runs on 1st of every month
# ─────────────────────────────────────────────────────────────────────────────

async def run_monthly_usage_emails() -> Dict:
    """
    Fetches all users and sends monthly usage emails.
    Called by the scheduler on the 1st of every month.
    Returns a summary dict.
    """
    logger.info("Starting monthly usage email job...")

    users_data = fetch_all_users_usage()

    if not users_data:
        logger.info("No users to email.")
        return {"sent": 0, "failed": 0, "total": 0}

    sent   = 0
    failed = 0

    for user_data in users_data:
        try:
            send_monthly_usage_email(user_data)
            sent += 1
            # Small delay between emails to avoid SMTP rate limits
            await asyncio.sleep(0.5)
        except Exception as e:
            logger.error(f"Failed for {user_data.get('email')}: {e}")
            failed += 1

    summary = {"sent": sent, "failed": failed, "total": len(users_data)}
    logger.info(f"Monthly usage email job complete: {summary}")
    return summary

async def send_usage_email_to_user(email: str) -> Dict:
    try:
        # Fetch user
        user_result = supabase.table("DimUsers") \
            .select("user_id, email, full_name, subscription_plan, company_name") \
            .eq("email", email) \
            .execute()

        if not user_result.data:
            return {"status": "failed", "reason": f"User {email} not found"}

        user = user_result.data[0]
        user_id = user.get("user_id")

        # Fetch workspaces
        workspaces_result = supabase.table("DimWorkSpaces") \
            .select("workspace_name, subscription_id") \
            .eq("user_id", user_id) \
            .eq("status", "active") \
            .execute()

        workspaces = workspaces_result.data or []
        if not workspaces:
            return {"status": "failed", "reason": f"No active workspaces for {email}"}

        # Fetch subscription usage
        subscription_id = workspaces[0].get("subscription_id")
        sub_usage = None
        if subscription_id:
            sub_result = supabase.table("FactSubscriptionUsage") \
                .select("*") \
                .eq("subscription_id", subscription_id) \
                .execute()
            sub_usage = sub_result.data[0] if sub_result.data else None

        # Fetch workspace usages
        workspace_usages = []
        for ws in workspaces:
            ws_name = ws.get("workspace_name")
            if not ws_name:
                continue
            ws_result = supabase.table("FactWorkSpaceUsage") \
                .select("*") \
                .eq("workspace_name", ws_name) \
                .execute()
            if ws_result.data:
                ws_data = ws_result.data[0]
                workspace_usages.append({
                    "workspace_name": ws_name,
                    "user_upload":    ws_data.get("user_upload", 0) or 0,
                    "max_upload":     ws_data.get("max_upload",  0) or 0,
                    "user_api":       ws_data.get("user_api",    0) or 0,
                    "max_api":        ws_data.get("max_api",     0) or 0,
                    "user_token":     ws_data.get("user_token",  0) or 0,
                    "max_token":      ws_data.get("max_token",   0) or 0,
                    "status":         ws_data.get("status", "active"),
                })

        user_data = {
            "user_id":           user_id,
            "email":             email,
            "full_name":         user.get("full_name", "User"),
            "subscription_plan": user.get("subscription_plan", "Free"),
            "company_name":      user.get("company_name", ""),
            "sub_usage":         sub_usage,
            "workspace_usages":  workspace_usages,
        }

        send_monthly_usage_email(user_data)
        return {"status": "success", "email": email}

    except Exception as e:
        logger.error(f"send_usage_email_to_user error: {e}")
        return {"status": "failed", "reason": str(e)}
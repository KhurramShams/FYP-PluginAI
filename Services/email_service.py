import os
import asyncio
import logging
from contextlib import asynccontextmanager
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from typing import Optional
import smtplib
import aiosmtplib
from dotenv import load_dotenv

load_dotenv(override=True)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# SMTP CONFIG — validated at import time
# ─────────────────────────────────────────────────────────────────────────────

SMTP_HOST       = os.getenv("SMTP_HOST")
SMTP_PORT       = int(os.getenv("SMTP_PORT", 465))
SMTP_USERNAME   = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD   = os.getenv("SMTP_PASS")
SMTP_FROM_NAME  = "Plugin AI"
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL")

# Logo Links
_LOGO_URL = os.getenv("LOGO_URL")
_ICON_URL = os.getenv("ICON_URL")

_REQUIRED_ENV = {
    "SMTP_HOST":       SMTP_HOST,
    "SMTP_USERNAME":   SMTP_USERNAME,
    "SMTP_PASS":       SMTP_PASSWORD,
    "SMTP_FROM_EMAIL": SMTP_FROM_EMAIL,
}
_missing = [k for k, v in _REQUIRED_ENV.items() if not v]
if _missing:
    raise EnvironmentError(
        f"Missing required SMTP environment variables: {', '.join(_missing)}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# SMTP CONNECTION — async context manager (reusable, not a function dependency)
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def _smtp_connection():
    """
    Async context manager that yields an authenticated SMTP connection.
    Each email function uses this directly — no send_email() middleman.
    """
    smtp = aiosmtplib.SMTP(
        hostname=SMTP_HOST,
        port=SMTP_PORT,
        use_tls=True,
    )
    await smtp.connect()
    await smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
    try:
        yield smtp
    finally:
        try:
            await smtp.quit()
        except Exception:
            pass  # Already disconnected — safe to ignore


# ─────────────────────────────────────────────────────────────────────────────
# SHARED UTILITIES — pure helpers, no I/O
# ─────────────────────────────────────────────────────────────────────────────

def _mask_email(email: str) -> str:
    """Mask email for GDPR-safe logging. e.g. jo***@example.com"""
    try:
        local, domain = email.split("@", 1)
        return f"{local[:2]}***@{domain}"
    except ValueError:
        return "***"


def _now() -> str:
    return datetime.utcnow().strftime("%B %d, %Y at %H:%M UTC")


def _badge(color: str, text: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        f'style="display:inline-table;margin:0 4px 0 0;">'
        f'<tr><td style="background:{color};color:#ffffff;padding:6px 16px;'
        f'border-radius:6px;font-size:11px;font-weight:800;letter-spacing:1.2px;'
        f'text-transform:uppercase;font-family:Arial,sans-serif;">{text}</td></tr></table>'
    )


def _row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="padding:12px 16px;color:#94a3b8;font-size:13px;'
        f'font-family:Arial,sans-serif;border-bottom:1px solid #1e293b;'
        f'width:140px;vertical-align:top;">{label}</td>'
        f'<td style="padding:12px 16px;color:#f1f5f9;font-size:13px;'
        f'font-family:Arial,sans-serif;font-weight:600;border-bottom:1px solid #1e293b;'
        f'vertical-align:top;">{value}</td>'
        f'</tr>'
    )


def _build_message(
    to_email:   str,
    subject:    str,
    html_body:  str,
    plain_body: str,) -> MIMEMultipart:
    """
    Builds a MIME message with both plain-text and HTML parts.
    Plain-text first, HTML last — clients prefer the last matching part.
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(plain_body, "plain"))
    msg.attach(MIMEText(html_body,  "html"))
    return msg


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, to_email, msg.as_string())

        logger.info(f"✅ Email sent → {to_email}")
        return True

    except Exception as e:
        logger.error(f"❌ Email error: {str(e)}")
        return False

def _wrap_template(content: str, title: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{title}</title>
  <!--[if mso]><style>table,td {{font-family:Arial,sans-serif !important;}}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    {title} — Plugin AI Notification&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- OUTER WRAPPER -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#080810;padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- EMAIL CONTAINER -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="max-width:620px;width:100%;border-collapse:separate;">

          <!-- ╔═══════════════════════════════════════════════════════╗ -->
          <!-- ║  HERO HEADER — Gradient with centered Logo           ║ -->
          <!-- ╚═══════════════════════════════════════════════════════╝ -->
          <tr>
            <td style="background:linear-gradient(160deg, #1a103d 0%, #0f0a2a 40%, #0d1530 100%);
                        border-radius:20px 20px 0 0;
                        padding:48px 40px 40px;
                        text-align:center;
                        border-bottom:2px solid rgba(124,109,240,0.2);">
              <!-- Logo -->
              <img src="{_LOGO_URL}"
                   alt="Plugin AI"
                   width="160" height="auto"
                   style="display:block;margin:0 auto 24px;max-width:160px;height:auto;" />
              <!-- Decorative line -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="margin:0 auto;">
                <tr>
                  <td style="width:40px;height:3px;background:linear-gradient(90deg,transparent,#7c6df0);border-radius:2px;"></td>
                  <td style="width:12px;"></td>
                  <td style="width:8px;height:8px;background:#7c6df0;border-radius:50%;"></td>
                  <td style="width:12px;"></td>
                  <td style="width:40px;height:3px;background:linear-gradient(90deg,#7c6df0,transparent);border-radius:2px;"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ╔═══════════════════════════════════════════════════════╗ -->
          <!-- ║  CONTENT CARD — Dark card with content               ║ -->
          <!-- ╚═══════════════════════════════════════════════════════╝ -->
          <tr>
            <td style="background:#0f0f1a;padding:44px 40px 40px;
                        border-left:1px solid rgba(124,109,240,0.08);
                        border-right:1px solid rgba(124,109,240,0.08);">
              {content}
            </td>
          </tr>

          <!-- ╔═══════════════════════════════════════════════════════╗ -->
          <!-- ║  FOOTER                                              ║ -->
          <!-- ╚═══════════════════════════════════════════════════════╝ -->
          <tr>
            <td style="background:#0a0a14;
                        border-radius:0 0 20px 20px;
                        border-top:1px solid rgba(124,109,240,0.1);
                        padding:32px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <!-- Logo icon -->
                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <img src="{_ICON_URL}"
                         alt="P" width="32" height="32"
                         style="display:block;margin:0 auto;border-radius:8px;opacity:0.5;" />
                  </td>
                </tr>
                <!-- Links -->
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0 12px;">
                          <a href="https://pluginai.space/app/dashboard"
                             style="color:#64748b;font-size:12px;text-decoration:none;font-family:Arial,sans-serif;">Dashboard</a>
                        </td>
                        <td style="color:#334155;font-size:12px;">|</td>
                        <td style="padding:0 12px;">
                          <a href="https://pluginai.space/app/settings"
                             style="color:#64748b;font-size:12px;text-decoration:none;font-family:Arial,sans-serif;">Settings</a>
                        </td>
                        <td style="color:#334155;font-size:12px;">|</td>
                        <td style="padding:0 12px;">
                          <a href="mailto:{SMTP_FROM_EMAIL}"
                             style="color:#64748b;font-size:12px;text-decoration:none;font-family:Arial,sans-serif;">Support</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Disclaimer -->
                <tr>
                  <td align="center">
                    <p style="margin:0 0 8px;font-size:11px;color:#475569;line-height:1.5;font-family:Arial,sans-serif;text-align:center;">
                      This is an automated message from {SMTP_FROM_NAME}.<br>
                      If you did not perform this action,
                      <a href="mailto:{SMTP_FROM_EMAIL}" style="color:#7c6df0;text-decoration:none;">contact support</a>.
                    </p>
                    <p style="margin:0;font-size:11px;color:#334155;font-family:Arial,sans-serif;text-align:center;">
                      &copy; 2026 Plugin AI &middot; Intelligent RAG Platform
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>"""




async def _send_with_retry(
    to_email:   str,
    subject:    str,
    html_body:  str,
    plain_body: str,
    retries:    int = 3,) -> bool:
    """
    Core dispatcher used internally by every email function.
    Handles retry with exponential backoff (1s → 2s → 4s).
    NOT a public function — each email function calls this directly.
    """
    msg = _build_message(to_email, subject, html_body, plain_body)

    for attempt in range(1, retries + 1):
        try:
            async with _smtp_connection() as smtp:
                await smtp.send_message(msg)
            logger.info(
                f"✅ Email sent → {_mask_email(to_email)} | {subject} "
                f"(attempt {attempt})"
            )
            return True

        except aiosmtplib.SMTPAuthenticationError:
            logger.error("❌ SMTP authentication failed — check credentials")
            return False  # No point retrying auth failures

        except aiosmtplib.SMTPException as e:
            logger.warning(
                f"⚠️  SMTP error on attempt {attempt}/{retries}: {e}"
            )
        except Exception as e:
            logger.warning(
                f"⚠️  Unexpected error on attempt {attempt}/{retries}: {e}"
            )

        if attempt < retries:
            wait = 2 ** (attempt - 1)  # 1s, 2s, 4s
            logger.info(f"🔄 Retrying in {wait}s...")
            await asyncio.sleep(wait)

    logger.error(
        f"❌ All {retries} attempts failed → {_mask_email(to_email)} | {subject}"
    )
    return False

# 
# ─────────────────────────────────────────────────────────────────────────────
# SELF-CONTAINED EMAIL FUNCTIONS
# Each function owns its subject, template, plain-text, and send logic.
# No function calls another email function.
# Call each directly via FastAPI BackgroundTasks.
# ─────────────────────────────────────────────────────────────────────────────

async def send_login_alert_email(
    to_email:   str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,) -> bool:
    """
    Login alert email — fully self-contained.
    Usage: background_tasks.add_task(send_login_alert_email, email, ip, ua)
    """
    subject = "🔐 New Login to Your Account"

    # ── Safe UA truncation at word boundary ──────────────────────────────────
    ua_raw     = user_agent or "Unknown"
    ua_display = (
        ua_raw[:77] + "..." if len(ua_raw) > 80
        else ua_raw
    )

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      New Login Detected
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      We noticed a new sign-in to your Plugin AI account. If this was you, there's nothing else you need to do.
    </p>
    {_badge('#10b981', 'SUCCESS')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Account',    to_email)}
        {_row('Time',       _now())}
        {_row('IP Address', ip_address or 'Unknown')}
        {_row('Device',     ua_display)}
      </table>
    </div>
    <div style="background:rgba(239,68,68,0.1);border-radius:12px;padding:20px;
                border-left:4px solid #ef4444;margin-top:24px;">
      <p style="margin:0;color:#fca5a5;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;">
        <strong style="color:#fef2f2;">Didn't recognize this activity?</strong><br>
        Please change your password immediately and contact support to secure your account.
      </p>
    </div>
    """

    # ── Plain-text fallback ──────────────────────────────────────────────────
    plain_body = (
        f"New Login Detected — {SMTP_FROM_NAME}\n\n"
        f"A new login to your account was detected.\n\n"
        f"Account:    {to_email}\n"
        f"Time:       {_now()}\n"
        f"IP Address: {ip_address or 'Unknown'}\n"
        f"Device:     {ua_display}\n\n"
        f"Not you? Change your password immediately.\n"
        f"Contact support: {SMTP_FROM_EMAIL}"
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Login Alert"),
        plain_body,
    )


async def send_password_change_email(to_email: str) -> bool:
    """
    Password change alert — fully self-contained.
    Usage: background_tasks.add_task(send_password_change_email, email)
    """
    subject = "🔑 Password Changed"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Password Changed
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      Your account password has been successfully updated.
    </p>
    {_badge('#f59e0b', 'SECURITY ALERT')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Account', to_email)}
        {_row('Time',    _now())}
      </table>
    </div>
    <div style="background:rgba(239,68,68,0.1);border-radius:12px;padding:20px;
                border-left:4px solid #ef4444;margin-top:24px;">
      <p style="margin:0;color:#fca5a5;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;">
        <strong style="color:#fef2f2;">Didn't make this change?</strong><br>
        Contact our <a href="mailto:{SMTP_FROM_EMAIL}" style="color:#ef4444;text-decoration:none;border-bottom:1px solid #ef4444;">support team</a> immediately to restrict account access.
      </p>
    </div>
    """

    plain_body = (
        f"Password Changed — {SMTP_FROM_NAME}\n\n"
        f"Your account password was successfully changed.\n\n"
        f"Account: {to_email}\n"
        f"Time:    {_now()}\n\n"
        f"Not you? Contact support immediately: {SMTP_FROM_EMAIL}"
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Password Changed"),
        plain_body,
    )


async def send_file_upload_email(
    to_email:       str,
    file_name:      str,
    workspace_name: str,
    file_size_kb:   Optional[float] = None,) -> bool:
    """
    File upload notification — fully self-contained.
    Usage: background_tasks.add_task(send_file_upload_email, email, fname, wname, size)
    """
    subject      = "📄 File Upload Notification"
    size_display = f"{file_size_kb:.1f} KB" if file_size_kb is not None else "N/A"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      File Uploaded Successfully
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      A new file was uploaded to your AI workspace and is now available for querying.
    </p>
    {_badge('#3b82f6', 'UPLOAD COMPLETE')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('File Name',  file_name)}
        {_row('Workspace',  workspace_name)}
        {_row('Size',       size_display)}
        {_row('Uploaded At', _now())}
      </table>
    </div>
    """

    plain_body = (
        f"File Uploaded — {SMTP_FROM_NAME}\n\n"
        f"A new file was uploaded to your workspace.\n\n"
        f"File Name: {file_name}\n"
        f"Workspace: {workspace_name}\n"
        f"Size:      {size_display}\n"
        f"Time:      {_now()}"
    )
    print(f"send_file_upload_email :{to_email}")
    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "File Uploaded"),
        plain_body,
    )


async def send_file_delete_email(
    to_email:       str,
    file_name:      str,
    workspace_name: str,) -> bool:
    """
    File deletion notification — fully self-contained.
    Usage: background_tasks.add_task(send_file_delete_email, email, fname, wname)
    """
    subject = "🗑️ File Deleted Notification"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      File Removed
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      A file has been permanently deleted from your workspace. It will no longer be available in queries.
    </p>
    {_badge('#ef4444', 'DELETED')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('File Name',  file_name)}
        {_row('Workspace',  workspace_name)}
        {_row('Deleted At', _now())}
      </table>
    </div>
    """

    plain_body = (
        f"File Deleted — {SMTP_FROM_NAME}\n\n"
        f"A file was permanently deleted from your workspace.\n\n"
        f"File Name: {file_name}\n"
        f"Workspace: {workspace_name}\n"
        f"Time:      {_now()}"
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "File Deleted"),
        plain_body,
    )


async def send_workspace_create_email(
    to_email:       str,
    workspace_name: str,) -> bool:
    """
    Workspace creation notification — fully self-contained.
    Usage: background_tasks.add_task(send_workspace_create_email, email, wname)
    """
    subject = "✅ Workspace Created"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Workspace Created
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      Your new AI workspace is ready. You can now start uploading documents and building intelligent assistants.
    </p>
    {_badge('#10b981', 'CREATED')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Workspace', workspace_name)}
        {_row('Created At', _now())}
      </table>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <a href="https://pluginai.space/app/workspaces"
         style="display:inline-block;background:#7c6df0;color:#ffffff;
                padding:14px 32px;border-radius:8px;text-decoration:none;
                font-family:Arial,sans-serif;font-size:14px;font-weight:600;
                box-shadow:0 0 20px rgba(124,109,240,0.3);">Go to Workspace &rarr;</a>
    </div>
    """

    plain_body = (
        f"Workspace Created — {SMTP_FROM_NAME}\n\n"
        f"Your new workspace is ready to use.\n\n"
        f"Workspace: {workspace_name}\n"
        f"Time:      {_now()}"
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Workspace Created"),
        plain_body,
    )


async def send_workspace_delete_email(
    to_email:       str,
    workspace_name: str,) -> bool:
    """
    Workspace deletion notification — fully self-contained.
    Usage: background_tasks.add_task(send_workspace_delete_email, email, wname)
    """
    subject = "🗑️ Workspace Deleted"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Workspace Deleted
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      A workspace has been permanently removed from your Plugin AI account.
    </p>
    {_badge('#ef4444', 'DELETED')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Workspace',  workspace_name)}
        {_row('Deleted At', _now())}
      </table>
    </div>
    <div style="background:rgba(239,68,68,0.1);border-radius:12px;padding:20px;
                border-left:4px solid #ef4444;margin-top:24px;">
      <p style="margin:0;color:#fca5a5;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;">
        <strong style="color:#fef2f2;">Action Complete</strong><br>
        All documents, settings, and assistants in this workspace have been permanently erased and cannot be recovered.
      </p>
    </div>
    """

    plain_body = (
        f"Workspace Deleted — {SMTP_FROM_NAME}\n\n"
        f"A workspace was permanently deleted from your account.\n\n"
        f"Workspace: {workspace_name}\n"
        f"Time:      {_now()}\n\n"
        f"All files and data in this workspace have been permanently removed."
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Workspace Deleted"),
        plain_body,
    )


async def send_plan_upgrade_email(
    to_email:  str,
    plan_name: str,) -> bool:
    """
    Plan upgrade notification — fully self-contained.
    Usage: background_tasks.add_task(send_plan_upgrade_email, email, plan)
    """
    subject = "⬆️ Plan Upgraded"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Plan Upgraded
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      Congratulations! Your Plugin AI subscription has been upgraded. You now have access to higher limits and premium features.
    </p>
    {_badge('#10b981', 'UPGRADED')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('New Plan',   plan_name)}
        {_row('Upgraded At', _now())}
      </table>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <a href="https://pluginai.space/app/dashboard"
         style="display:inline-block;background:#7c6df0;color:#ffffff;
                padding:14px 32px;border-radius:8px;text-decoration:none;
                font-family:Arial,sans-serif;font-size:14px;font-weight:600;
                box-shadow:0 0 20px rgba(124,109,240,0.3);">Go to Dashboard &rarr;</a>
    </div>
    """

    plain_body = (
        f"Plan Upgraded — {SMTP_FROM_NAME}\n\n"
        f"Your subscription has been successfully upgraded.\n\n"
        f"New Plan: {plan_name}\n"
        f"Time:     {_now()}"
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Plan Upgraded"),
        plain_body,
    )


async def send_payment_failed_email(
    to_email:  str,
    plan_name: str,
    amount:    Optional[str] = None,) -> bool:
    print("Enter send_payment_failed_email Function")

    subject = "⚠️ Payment Failed"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Payment Failed
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      We couldn't process the charge for your Plugin AI subscription. Your service may be interrupted if the issue is not resolved soon.
    </p>
    {_badge('#ef4444', 'PAYMENT FAILED')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Plan',      plan_name)}
        {_row('Amount',    amount or 'N/A')}
        {_row('Failed At', _now())}
      </table>
    </div>
    <div style="background:rgba(239,68,68,0.1);border-radius:12px;padding:20px;
                border-left:4px solid #ef4444;margin-top:24px;">
      <p style="margin:0;color:#fca5a5;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;">
        <strong style="color:#fef2f2;">Action Required</strong><br>
        Please update your payment method immediately to keep your workspace limits active.
      </p>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <a href="https://pluginai.space/app/settings"
         style="display:inline-block;background:#ef4444;color:#ffffff;
                padding:14px 32px;border-radius:8px;text-decoration:none;
                font-family:Arial,sans-serif;font-size:14px;font-weight:600;
                box-shadow:0 0 20px rgba(239,68,68,0.3);">Update Payment Method &rarr;</a>
    </div>
    """

    plain_body = (
        f"Payment Failed — {SMTP_FROM_NAME}\n\n"
        f"We were unable to process your payment.\n\n"
        f"Plan:   {plan_name}\n"
        f"Amount: {amount or 'N/A'}\n"
        f"Time:   {_now()}\n\n"
        f"Please update your payment method to avoid service interruption."
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Payment Failed"),
        plain_body,
    )


async def send_payment_success_email(
    to_email:   str,
    plan_name:  str,
    amount:     Optional[str] = None,
    invoice_id: Optional[str] = None,) -> None:
    print("Enter send_payment_success_email Function")
    subject = "💳 Payment Successful — Plugin AI"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Payment Successful
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      Your payment has been processed successfully and your Plugin AI subscription is active. Thank you!
    </p>
    {_badge('#10b981', 'PAYMENT CONFIRMED')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Plan',       plan_name)}
        {_row('Amount',     amount or 'N/A')}
        {_row('Invoice ID', invoice_id or 'N/A')}
        {_row('Paid At',    _now())}
      </table>
    </div>
    <div style="background:rgba(16,185,129,0.1);border-radius:12px;padding:20px;
                border-left:4px solid #10b981;margin-top:24px;">
      <p style="margin:0;color:#6ee7b7;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;">
        <strong style="color:#f8fafc;">You're ready to go!</strong><br>
        Your plan is now fully active. Access all your premium features directly from the dashboard.
      </p>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <a href="https://pluginai.space/app/dashboard"
         style="display:inline-block;background:#7c6df0;color:#ffffff;
                padding:14px 32px;border-radius:8px;text-decoration:none;
                font-family:Arial,sans-serif;font-size:14px;font-weight:600;
                box-shadow:0 0 20px rgba(124,109,240,0.3);">Go to Dashboard &rarr;</a>
    </div>
    """

    plain_body = (
        f"Payment Successful — {SMTP_FROM_NAME}\n\n"
        f"Your payment has been processed successfully.\n\n"
        f"Plan:    {plan_name}\n"
        f"Amount:  {amount or 'N/A'}\n"
        f"Invoice: {invoice_id or 'N/A'}\n"
        f"Time:    {_now()}\n\n"
        f"Thank you for your payment. Your plan is now active."
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Payment Successful"),
        plain_body,
    )


async def send_plan_activation_email(
    to_email:  str,
    plan_name: str,
    features:  Optional[list] = None,) -> None:
    print("Enter send_plan_activation_email function")
    subject = f"🚀 Your {plan_name} Plan is Now Active — Plugin AI"

    features_html = ""
    features_text = ""
    if features:
        items = "".join(
            f'<li style="margin-bottom:6px;color:#495057;font-size:14px;">'
            f'✅ {f}</li>'
            for f in features
        )
        features_html = f'<ul style="margin:12px 0;padding-left:20px;">{items}</ul>'
        features_text = "\n".join(f"  ✅ {f}" for f in features)

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Plan Activated
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      Your <strong style="color:#f8fafc;">{plan_name}</strong> plan is now active. Welcome to the next level of AI-powered solutions!
    </p>
    {_badge('#7c6df0', plan_name.upper())}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Plan',        plan_name)}
        {_row('Status',      'Active')}
        {_row('Activated At', _now())}
      </table>
    </div>
    {features_html.replace('color:#495057;', 'color:#cbd5e1;').replace('✅', '<span style="color:#7c6df0;">✦</span>')}
    <div style="background:rgba(124,109,240,0.1);border-radius:12px;padding:20px;
                border-left:4px solid #7c6df0;margin-top:24px;">
      <p style="margin:0;color:#a89ff5;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;">
        <strong style="color:#f8fafc;">Welcome aboard!</strong><br>
        Your new features are live and waiting for you.
      </p>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <a href="https://pluginai.space/app/dashboard"
         style="display:inline-block;background:#7c6df0;color:#ffffff;
                padding:14px 32px;border-radius:8px;text-decoration:none;
                font-family:Arial,sans-serif;font-size:14px;font-weight:600;
                box-shadow:0 0 20px rgba(124,109,240,0.3);">Start Using Plugin AI &rarr;</a>
    </div>
    """

    plain_body = (
        f"Plan Activated — {SMTP_FROM_NAME}\n\n"
        f"Your {plan_name} plan is now active.\n\n"
        f"Plan:      {plan_name}\n"
        f"Status:    Active\n"
        f"Activated: {_now()}\n\n"
        f"Features:\n{features_text}\n\n"
        f"Welcome! Start using your plan features right away."
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Plan Activated"),
        plain_body,
    )


async def send_plan_renewal_email(
    to_email:     str,
    plan_name:    str,
    renewal_date: Optional[str] = None,
    amount:       Optional[str] = None,) -> None:
    subject = f"🔄 Your {plan_name} Plan Has Been Renewed — Plugin AI"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Plan Renewed
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      Your <strong style="color:#f8fafc;">{plan_name}</strong> plan has successfully renewed. Your usage limits are reset for the new cycle.
    </p>
    {_badge('#3b82f6', 'RENEWED')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Plan',         plan_name)}
        {_row('Amount',       amount or 'N/A')}
        {_row('Renewed On',   _now())}
        {_row('Next Renewal', renewal_date or 'N/A')}
      </table>
    </div>
    <div style="background:rgba(59,130,246,0.1);border-radius:12px;padding:20px;
                border-left:4px solid #3b82f6;margin-top:24px;">
      <p style="margin:0;color:#93c5fd;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;">
        <strong style="color:#f8fafc;">Limits Reset</strong><br>
        Your workspace capacities have been fully restored for the upcoming month.
      </p>
    </div>
    """

    plain_body = (
        f"Plan Renewed — {SMTP_FROM_NAME}\n\n"
        f"Your {plan_name} plan has been successfully renewed.\n\n"
        f"Plan:         {plan_name}\n"
        f"Amount:       {amount or 'N/A'}\n"
        f"Renewed On:   {_now()}\n"
        f"Next Renewal: {renewal_date or 'N/A'}\n\n"
        f"Your usage limits have been reset for the new billing cycle."
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Plan Renewed"),
        plain_body,
    )


async def send_plan_cancel_email(
    to_email:  str,
    plan_name: str,
    end_date:  Optional[str] = None,) -> None:
    subject = f"❌ Your {plan_name} Plan Has Been Cancelled — Plugin AI"

    html_content = f"""
    <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:Arial,sans-serif;">
      Plan Cancelled
    </h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
      Your <strong style="color:#f8fafc;">{plan_name}</strong> plan cancellation is confirmed.
    </p>
    {_badge('#ef4444', 'CANCELLED')}
    <br><br>
    <div style="background:#0a0a14;border-radius:12px;padding:24px;margin:24px 0;border:1px solid #1e293b;">
      <table cellpadding="0" cellspacing="0" width="100%" border="0">
        {_row('Plan',         plan_name)}
        {_row('Cancelled',    _now())}
        {_row('Access Ends',  end_date or 'End of billing cycle')}
      </table>
    </div>
    <div style="background:rgba(239,68,68,0.1);border-radius:12px;padding:20px;
                border-left:4px solid #ef4444;margin-top:24px;">
      <p style="margin:0;color:#fca5a5;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;">
        <strong style="color:#fef2f2;">What happens next?</strong><br>
        You will retain full access until <strong>{end_date or 'the end of your billing cycle'}</strong>.
        After that, you will be downgraded to the Free tier.
      </p>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <a href="https://pluginai.space/app/settings"
         style="display:inline-block;background:#334155;color:#ffffff;
                padding:14px 32px;border-radius:8px;text-decoration:none;
                font-family:Arial,sans-serif;font-size:14px;font-weight:600;
                box-shadow:0 4px 6px rgba(0,0,0,0.1);">Reactivate Plan &rarr;</a>
    </div>
    """

    plain_body = (
        f"Plan Cancelled — {SMTP_FROM_NAME}\n\n"
        f"Your {plan_name} plan has been cancelled.\n\n"
        f"Plan:         {plan_name}\n"
        f"Cancelled On: {_now()}\n"
        f"Access Until: {end_date or 'End of billing period'}\n\n"
        f"You will retain access until {end_date or 'the end of your billing period'}.\n"
        f"After that your account will revert to the Free plan.\n\n"
        f"Changed your mind? Visit: https://pluginai.space/upgrade"
    )

    return await _send_with_retry(
        to_email, subject,
        _wrap_template(html_content, "Plan Cancelled"),
        plain_body,
    )
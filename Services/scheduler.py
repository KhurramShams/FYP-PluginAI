from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from Services.usage_email import run_monthly_usage_emails
import logging


logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

def start_scheduler():

    # ── Monthly usage email — 1st of every month at 8:00 AM UTC ──────────────
    scheduler.add_job(
        func    = run_monthly_usage_emails,
        trigger = CronTrigger(day=1, hour=8, minute=0),
        id      = "monthly_usage_email",
        name    = "Send Monthly Usage Emails",
        replace_existing = True,
    )

    scheduler.start()
    logger.info("Scheduler started — monthly usage emails scheduled for "
                "1st of every month at 08:00 UTC")


def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler stopped.")
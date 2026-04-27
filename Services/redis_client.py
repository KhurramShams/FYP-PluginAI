import os
import logging
from upstash_redis import Redis
from dotenv import load_dotenv

load_dotenv(override=True)
logger = logging.getLogger(__name__)

# ── Single shared Redis instance ──────────────────────────────────────────────
try:
    redis = Redis(
        url=os.getenv("UPSTASH_REDIS_URL"),
        token=os.getenv("UPSTASH_REDIS_TOKEN")
    )
    # Test connection
    redis.ping()
    logger.info("✅ Redis connected successfully.")
except Exception as e:
    logger.error(f"❌ Redis connection failed: {e}")
    redis = None


def is_redis_available() -> bool:
    """Check if Redis is available before any operation."""
    try:
        if redis is None:
            return False
        redis.ping()
        return True
    except Exception:
        return False
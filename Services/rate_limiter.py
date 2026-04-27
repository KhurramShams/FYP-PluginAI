import logging
from typing   import Optional, Callable
from fastapi  import HTTPException, Request
from Services.redis_client import redis, is_redis_available

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# CORE RATE LIMITER
# ─────────────────────────────────────────────────────────────────────────────

async def check_rate_limit(
    key:        str,
    limit:      int,
    window:     int,
    identifier: str,
) -> dict:
    """
    Sliding window rate limiter using Redis.

    Args:
        key:        Redis key prefix (e.g. 'admin_rate')
        limit:      Max requests allowed in window
        window:     Time window in seconds
        identifier: Unique identifier (IP, user_id, api_key hash)

    Returns:
        dict with allowed, remaining, retry_after
    """
    if not is_redis_available():
        # Redis unavailable — fail open (allow request)
        logger.warning("Rate limiter: Redis unavailable — failing open.")
        return {
            "allowed":     True,
            "remaining":   limit,
            "retry_after": 0,
        }

    redis_key = f"{key}:{identifier}"

    try:
        # Increment counter
        current = redis.incr(redis_key)

        # Set TTL on first request
        if current == 1:
            redis.expire(redis_key, window)

        # Get remaining TTL
        ttl = redis.ttl(redis_key)

        if current > limit:
            return {
                "allowed":     False,
                "remaining":   0,
                "retry_after": ttl if ttl > 0 else window,
                "current":     current,
                "limit":       limit,
            }

        return {
            "allowed":     True,
            "remaining":   max(0, limit - current),
            "retry_after": 0,
            "current":     current,
            "limit":       limit,
        }

    except Exception as e:
        logger.error(f"Rate limiter error: {e}")
        # Fail open on error
        return {
            "allowed":   True,
            "remaining": limit,
            "retry_after": 0,
        }


# ─────────────────────────────────────────────────────────────────────────────
# RATE LIMIT CONFIGS
# ─────────────────────────────────────────────────────────────────────────────

RATE_LIMIT_CONFIGS = {

    # ── Admin routes ──────────────────────────────────────────────────────────
    # Very strict — admin key must not be brute-forced
    "admin_global":       {"limit": 100, "window": 60},    # 100 req/min total
    "admin_auth_fail":    {"limit": 5,   "window": 300},   # 5 fails/5 min per IP
    "admin_delete":       {"limit": 10,  "window": 60},    # 10 deletes/min
    "admin_broadcast":    {"limit": 3,   "window": 3600},  # 3 broadcasts/hour
    "admin_cache_flush":  {"limit": 5,   "window": 60},    # 5 flushes/min

    # ── Auth routes ───────────────────────────────────────────────────────────
    "login_attempt":      {"limit": 5,   "window": 300},   # 5 tries/5 min per IP
    "otp_request":        {"limit": 3,   "window": 300},   # 3 OTPs/5 min

    # ── API query routes ──────────────────────────────────────────────────────
    "api_query":          {"limit": 60,  "window": 60},    # 60 req/min per workspace
}


# ─────────────────────────────────────────────────────────────────────────────
# FASTAPI DEPENDENCY FACTORY
# Creates rate limit dependencies for specific configs
# ─────────────────────────────────────────────────────────────────────────────

def rate_limit(config_name: str, identifier_from: str = "ip"):
    """
    Returns a FastAPI dependency that enforces rate limiting.

    Args:
        config_name:      Key from RATE_LIMIT_CONFIGS
        identifier_from:  'ip' | 'key' | 'user_id'

    Usage:
        @router.delete("/users/{user_id}",
            dependencies=[Depends(rate_limit("admin_delete"))])
    """
    async def _dependency(request: Request):
        config = RATE_LIMIT_CONFIGS.get(config_name)
        if not config:
            return  # no config = no limit

        # ── Determine identifier ──────────────────────────────────────────────
        if identifier_from == "ip":
            forwarded  = request.headers.get("X-Forwarded-For")
            identifier = forwarded.split(",")[0].strip() \
                if forwarded else (
                    request.client.host if request.client else "unknown"
                )
        elif identifier_from == "key":
            identifier = request.headers.get("X-Admin-Key", "unknown")[:16]
        else:
            identifier = "global"

        # ── Check rate limit ──────────────────────────────────────────────────
        result = await check_rate_limit(
            key        = config_name,
            limit      = config["limit"],
            window     = config["window"],
            identifier = identifier,
        )

        if not result["allowed"]:
            raise HTTPException(
                status_code = 429,
                detail      = {
                    "error":       "Rate limit exceeded.",
                    "retry_after": result["retry_after"],
                    "limit":       result["limit"],
                    "window":      config["window"],
                },
                headers = {
                    "Retry-After":        str(result["retry_after"]),
                    "X-RateLimit-Limit":  str(config["limit"]),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset":  str(result["retry_after"]),
                }
            )

        # ── Attach rate limit headers to response ─────────────────────────────
        # Note: headers set on request state, middleware applies them
        request.state.rate_limit_remaining = result["remaining"]
        request.state.rate_limit_limit      = config["limit"]

    return _dependency


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN-SPECIFIC MIDDLEWARE CHECKER
# Tracks failed admin key attempts per IP
# ─────────────────────────────────────────────────────────────────────────────

async def check_admin_auth_rate_limit(request: Request) -> None:
    """
    Called when admin key validation FAILS.
    Blocks IP after 5 consecutive failures in 5 minutes.
    """
    forwarded  = request.headers.get("X-Forwarded-For")
    ip         = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )

    result = await check_rate_limit(
        key        = "admin_auth_fail",
        limit      = RATE_LIMIT_CONFIGS["admin_auth_fail"]["limit"],
        window     = RATE_LIMIT_CONFIGS["admin_auth_fail"]["window"],
        identifier = ip,
    )

    if not result["allowed"]:
        logger.warning(f"Admin brute force blocked — IP: {ip}")
        raise HTTPException(
            status_code = 429,
            detail      = {
                "error":       "Too many failed attempts. IP temporarily blocked.",
                "retry_after": result["retry_after"],
            },
            headers = {"Retry-After": str(result["retry_after"])}
        )
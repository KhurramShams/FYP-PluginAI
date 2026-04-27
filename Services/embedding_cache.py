import json
import hashlib
import logging
from typing import Optional, List
from Services.redis_client import redis, is_redis_available

logger = logging.getLogger(__name__)

# TTL: 24 hours — embeddings rarely change for same text
EMBEDDING_TTL = int(__import__('os').getenv("EMBEDDING_CACHE_TTL", 86400))


def _embedding_key(text: str) -> str:
    """Generate consistent cache key from text."""
    normalized = text.lower().strip()
    hash_val   = hashlib.md5(normalized.encode()).hexdigest()
    return f"emb:{hash_val}"


async def get_cached_embedding(text: str) -> Optional[List[float]]:
    """
    Fetch embedding from Redis cache.
    Returns None if not cached or Redis unavailable.
    """
    if not is_redis_available():
        return None

    try:
        key    = _embedding_key(text)
        cached = redis.get(key)

        if cached:
            logger.debug(f"Embedding cache HIT for: {text[:50]}")
            return json.loads(cached)

        logger.debug(f"Embedding cache MISS for: {text[:50]}")
        return None

    except Exception as e:
        # Never let cache failure break the pipeline
        logger.warning(f"Embedding cache GET failed: {e}")
        return None


async def set_cached_embedding(
    text:      str,
    embedding: List[float]
) -> bool:
    """
    Store embedding in Redis cache with TTL.
    Returns True on success, False on failure.
    """
    if not is_redis_available():
        return False

    try:
        key   = _embedding_key(text)
        value = json.dumps(embedding)
        redis.set(key, value, ex=EMBEDDING_TTL)
        logger.debug(f"Embedding cached for: {text[:50]}")
        return True

    except Exception as e:
        logger.warning(f"Embedding cache SET failed: {e}")
        return False


async def delete_cached_embedding(text: str) -> bool:
    """Delete a specific embedding from cache."""
    if not is_redis_available():
        return False
    try:
        redis.delete(_embedding_key(text))
        return True
    except Exception as e:
        logger.warning(f"Embedding cache DELETE failed: {e}")
        return False


# ── Stats helper ───────────────────────────────────────────────────────────────
async def get_embedding_cache_stats() -> dict:
    """Returns cache stats — useful for admin dashboard."""
    if not is_redis_available():
        return {"available": False}
    try:
        # Count embedding keys
        keys = redis.keys("emb:*")
        return {
            "available":    True,
            "cached_count": len(keys) if keys else 0,
            "ttl_seconds":  EMBEDDING_TTL,
        }
    except Exception as e:
        return {"available": False, "error": str(e)}
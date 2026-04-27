import json
import logging
from typing import List, Dict, Optional
from datetime import datetime
from Services.redis_client import redis, is_redis_available
from Integrations.pinecone_client import supabase
import asyncio

logger = logging.getLogger(__name__)

# Config
MAX_MESSAGES     = 20       # last 20 messages (10 exchanges)
CONVERSATION_TTL = int(__import__('os').getenv("CONVERSATION_CACHE_TTL", 3600))


def _conv_key(conversation_id: str) -> str:
    return f"conv:{conversation_id}"


# ─────────────────────────────────────────────────────────────────────────────
# READ — Get conversation history
# ─────────────────────────────────────────────────────────────────────────────

async def get_conversation_history(
    conversation_id: str) -> List[Dict]:
    """
    Fetch conversation history.
    Strategy:
      1. Try Redis first (fast, ~1ms)
      2. Fall back to Supabase if Redis miss (slower, ~50-200ms)
      3. Populate Redis from Supabase for next time
    Returns list of {role, content} dicts.
    """

    # ── Step 1: Try Redis ─────────────────────────────────────────────────────
    if is_redis_available():
        try:
            key     = _conv_key(conversation_id)
            cached  = redis.get(key)

            if cached:
                messages = json.loads(cached)
                logger.debug(
                    f"Conv cache HIT — id: {conversation_id}, "
                    f"messages: {len(messages)}"
                )
                # Refresh TTL on access
                redis.expire(key, CONVERSATION_TTL)
                return messages

        except Exception as e:
            logger.warning(f"Conv cache GET failed: {e}")

    # ── Step 2: Fall back to Supabase ─────────────────────────────────────────
    logger.debug(f"Conv cache MISS — fetching from Supabase: {conversation_id}")
    messages = await _fetch_from_supabase(conversation_id)

    # ── Step 3: Populate Redis for next request ───────────────────────────────
    if messages and is_redis_available():
        await _write_to_redis(conversation_id, messages)

    return messages


async def _fetch_from_supabase(conversation_id: str) -> List[Dict]:
    """Fetch last MAX_MESSAGES from Supabase."""
    try:
        result = supabase.table("DimConversations") \
            .select("role, content, created_at") \
            .eq("conversation_id", conversation_id) \
            .order("created_at", desc=True) \
            .limit(MAX_MESSAGES) \
            .execute()

        if not result.data:
            return []

        # Reverse to chronological order
        messages = list(reversed(result.data))
        return [
            {"role": row["role"], "content": row["content"]}
            for row in messages
        ]

    except Exception as e:
        logger.error(f"Supabase conversation fetch failed: {e}")
        return []


async def _write_to_redis(
    conversation_id: str,
    messages: List[Dict]) -> bool:
    """Write messages list to Redis."""
    try:
        key   = _conv_key(conversation_id)
        value = json.dumps(messages)
        redis.set(key, value, ex=CONVERSATION_TTL)
        return True
    except Exception as e:
        logger.warning(f"Conv cache write failed: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# WRITE — Append new message pair after each exchange
# ─────────────────────────────────────────────────────────────────────────────

async def append_messages(
    conversation_id: str,
    user_message:    str,
    ai_response:     str,) -> None:
    """
    Append user + assistant message to Redis after each exchange.
    Keeps only last MAX_MESSAGES.
    Also saves to Supabase in background (permanent record).
    """

    # ── Update Redis ──────────────────────────────────────────────────────────
    if is_redis_available():
        try:
            key      = _conv_key(conversation_id)
            cached   = redis.get(key)
            messages = json.loads(cached) if cached else []

            # Append new exchange
            messages.append({"role": "user",      "content": user_message})
            messages.append({"role": "assistant",  "content": ai_response})

            # Keep only last MAX_MESSAGES
            if len(messages) > MAX_MESSAGES:
                messages = messages[-MAX_MESSAGES:]

            redis.set(key, json.dumps(messages), ex=CONVERSATION_TTL)
            logger.debug(
                f"Conv cache updated — id: {conversation_id}, "
                f"total messages: {len(messages)}"
            )

        except Exception as e:
            logger.warning(f"Conv cache append failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# RESET — Clear conversation from Redis
# ─────────────────────────────────────────────────────────────────────────────

async def clear_conversation_cache(conversation_id: str) -> bool:
    """Delete conversation from Redis (keeps Supabase record intact)."""
    if not is_redis_available():
        return False
    try:
        redis.delete(_conv_key(conversation_id))
        logger.info(f"Conv cache cleared: {conversation_id}")
        return True
    except Exception as e:
        logger.warning(f"Conv cache clear failed: {e}")
        return False


# ── Stats helper ───────────────────────────────────────────────────────────────
async def get_conversation_cache_stats() -> dict:
    """Returns conversation cache stats."""
    if not is_redis_available():
        return {"available": False}
    try:
        keys = redis.keys("conv:*")
        return {
            "available":           True,
            "active_conversations": len(keys) if keys else 0,
            "max_messages":        MAX_MESSAGES,
            "ttl_seconds":         CONVERSATION_TTL,
        }
    except Exception as e:
        return {"available": False, "error": str(e)}
import httpx
import logging
import database as db

logger = logging.getLogger(__name__)

async def send_push_to_user(user_id: str, title: str, body: str, data: dict | None = None):
    """Fetch all push tokens for a user and send them an Expo push notification."""
    tokens = await db.find_many("push_tokens", {"user_id": user_id})
    if not tokens:
        return

    # Expo Push API limits payload to 100 messages at a time, but usually 1 user has 1-3 tokens
    messages = []
    for t in tokens:
        messages.append({
            "to": t["token"],
            "title": title,
            "body": body,
            "data": data or {}
        })

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages
            )
            if response.status_code >= 400:
                logger.error(f"Error sending push: {response.text}")
    except Exception as e:
        logger.error(f"Exception sending push: {str(e)}")

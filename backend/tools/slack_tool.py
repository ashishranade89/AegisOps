from langchain.tools import tool
import json
import logging
import urllib.request
from backend.utils.config import get_config

logger = logging.getLogger(__name__)
config = get_config()

@tool
def post_slack_notification(channel: str, message: str, blocks: list = None) -> str:
    """
    Sends a formatted Slack notification message to a specific alert channel.
    Useful for reporting incident progression or proposed remediation actions.
    """
    webhook_url = config.slack_webhook_url
    logger.info("Slack notification to #%s: %s", channel, message)
    
    payload = {
        "text": f"🚨 *Vendor Outage Incident Update* 🚨\n{message}",
        "channel": f"#{channel}"
    }
    if blocks:
        payload["blocks"] = blocks
        
    if webhook_url:
        try:
            req = urllib.request.Request(
                webhook_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as res:
                response = res.read().decode("utf-8")
                logger.info("Successfully posted to Slack webhook.")
                return json.dumps({"sent": True, "response": response})
        except Exception as e:
            logger.error("Failed to post to Slack webhook: %s", e)
            return json.dumps({"sent": False, "error": str(e)})
            
    # Mock fallback
    return json.dumps({
        "sent": True,
        "simulated": True,
        "message": f"Posted to simulated channel #{channel}: {message}"
    })

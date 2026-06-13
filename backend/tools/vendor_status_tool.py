from langchain.tools import tool
import json
import asyncio
import logging

logger = logging.getLogger(__name__)

KNOWN_VENDOR_URLS = {
    "stripe": "https://status.stripe.com",
    "aws": "https://health.aws.amazon.com/health/status",
    "twilio": "https://status.twilio.com",
    "cloudflare": "https://www.cloudflarestatus.com",
    "github": "https://www.githubstatus.com",
}

# Atlassian Statuspage JSON API base URLs
STATUSPAGE_API_URLS = {
    "stripe": "https://status.stripe.com/api/v2",
    "twilio": "https://status.twilio.com/api/v2",
    "cloudflare": "https://www.cloudflarestatus.com/api/v2",
    "github": "https://www.githubstatus.com/api/v2",
}

MOCK_VENDOR_RESPONSES = {
    "stripe": {
        "has_active_incident": True,
        "incident_title": "API Gateway Elevated Error Rates",
        "incident_description": "We are experiencing elevated error rates and latencies across our API Gateway endpoints. Our engineering team is actively investigating.",
        "affected_services": ["API Gateway", "Checkout", "Payment Intents"],
        "status_summary": "Service degradation: Stripe API is experiencing high error rates globally.",
        "current_status": "major_outage",
    },
    "aws": {
        "has_active_incident": True,
        "incident_title": "S3 High Latency and Error Rates in US-EAST-1",
        "incident_description": "We are investigating elevated error rates and latencies for Amazon S3 GET/PUT requests in the US-EAST-1 Region.",
        "affected_services": ["Amazon S3", "EC2 Instances dependent on S3 storage"],
        "status_summary": "Major outage: S3 storage bucket operations degraded in US-EAST-1.",
        "current_status": "major_outage",
    },
    "twilio": {
        "has_active_incident": True,
        "incident_title": "SMS API Delivery Timeout Latencies",
        "incident_description": "We are experiencing delays and timeouts routing SMS traffic via major US carriers.",
        "affected_services": ["Programmable SMS API", "MFA Verification Engine"],
        "status_summary": "Partial outage: Twilio SMS Gateway delivery delays.",
        "current_status": "partial_outage",
    },
    "cloudflare": {
        "has_active_incident": True,
        "incident_title": "Anycast Route Latency Anomalies",
        "incident_description": "We are seeing intermittent DNS resolution timeouts across several edge points in Europe.",
        "affected_services": ["Cloudflare DNS", "API Gateways", "Edge Cache"],
        "status_summary": "Degraded performance: DNS query resolution timeouts.",
        "current_status": "degraded_performance",
    },
    "github": {
        "has_active_incident": True,
        "incident_title": "OAuth Authentication Database Degradation",
        "incident_description": "We are investigating elevated error rates in login and OAuth systems.",
        "affected_services": ["GitHub OAuth", "GitHub Login", "API Access"],
        "status_summary": "Service degradation: GitHub authentication systems experiencing errors.",
        "current_status": "degraded_performance",
    },
}


async def _scrape_with_stagehand(target_url: str, api_key: str, model_name: str) -> dict | None:
    """Attempt headless browser scraping via Stagehand local mode."""
    try:
        from stagehand import AsyncStagehand

        logger.info("Starting Stagehand local mode for %s", target_url)
        async with AsyncStagehand(
            server="local",
            local_headless=True,
            local_ready_timeout_s=30.0,
            model_api_key=api_key,
        ) as client:
            session = await client.sessions.start(
                model_name=model_name,
                browser={"type": "local"},
            )
            try:
                await session.navigate(url=target_url)
                result = await session.extract(
                    instruction=(
                        "Extract all active incidents, service degradation notices, "
                        "and current operational status from this vendor status page. "
                        "If the page shows 'All Systems Operational' with no incidents, "
                        "set has_active_incident to false."
                    ),
                    schema={
                        "type": "object",
                        "properties": {
                            "has_active_incident": {"type": "boolean"},
                            "incident_title": {"type": "string"},
                            "incident_description": {"type": "string"},
                            "affected_services": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "status_summary": {"type": "string"},
                            "current_status": {"type": "string"},
                        },
                        "required": ["has_active_incident", "status_summary"],
                    },
                )
                if result and result.data and result.data.result:
                    raw = result.data.result
                    extracted = raw if isinstance(raw, dict) else (
                        raw.__dict__ if hasattr(raw, "__dict__") else None
                    )
                    if extracted:
                        extracted["live_data"] = True
                        return extracted
            finally:
                try:
                    await session.end()
                except Exception:
                    pass
    except Exception as e:
        logger.warning("Stagehand browser scrape failed: %s", e)
    return None


async def _scrape_with_httpx(vendor_key: str) -> dict | None:
    """Fetch live data from the Atlassian Statuspage JSON API (no auth required)."""
    base_url = STATUSPAGE_API_URLS.get(vendor_key)
    if not base_url:
        return None
    try:
        import httpx

        async with httpx.AsyncClient(
            timeout=12.0,
            follow_redirects=True,
            headers={"User-Agent": "IncidentInvestigator/1.0"},
        ) as client:
            status_resp, incidents_resp = await asyncio.gather(
                client.get(f"{base_url}/status.json"),
                client.get(f"{base_url}/incidents/unresolved.json"),
                return_exceptions=True,
            )

            status_data: dict = {}
            incidents_data: dict = {}
            if not isinstance(status_resp, Exception) and status_resp.status_code == 200:
                status_data = status_resp.json()
            if not isinstance(incidents_resp, Exception) and incidents_resp.status_code == 200:
                incidents_data = incidents_resp.json()

            incidents = incidents_data.get("incidents", [])
            page_status = status_data.get("status", {})
            indicator = page_status.get("indicator", "none")
            has_incident = bool(incidents) or indicator not in ("none", "")

            incident_title = ""
            incident_description = ""
            affected_services: list[str] = []

            if incidents:
                latest = incidents[0]
                incident_title = latest.get("name", "")
                updates = latest.get("incident_updates", [])
                if updates:
                    incident_description = updates[0].get("body", "")
                for comp in latest.get("components", []):
                    if comp.get("status", "operational") != "operational":
                        name = comp.get("name", "")
                        if name:
                            affected_services.append(name)

            status_description = page_status.get(
                "description", "All Systems Operational"
            )
            logger.info(
                "Statuspage API result for %s — incident=%s indicator=%s",
                vendor_key,
                has_incident,
                indicator,
            )
            return {
                "has_active_incident": has_incident,
                "incident_title": incident_title,
                "incident_description": incident_description,
                "affected_services": affected_services,
                "status_summary": status_description,
                "current_status": indicator,
                "live_data": True,
            }
    except Exception as e:
        logger.warning("httpx Statuspage API failed for %s: %s", vendor_key, e)
    return None


@tool
async def check_vendor_status_page(vendor_name: str, api_key: str = "") -> str:
    """
    Scrapes a third-party vendor's public status page for live outage information.

    Strategy (in order):
    1. Stagehand AI headless browser (if api_key provided)
    2. Atlassian Statuspage JSON API (live, no auth required)
    3. Curated mock data fallback

    Returns a JSON string with vendor, url, data, source, and error fields.
    """
    vendor_key = vendor_name.lower()
    target_url = KNOWN_VENDOR_URLS.get(
        vendor_key, f"https://status.{vendor_key}.com"
    )
    logger.info("Scraping status page for vendor '%s' → %s", vendor_name, target_url)

    result_data: dict | None = None
    source = "mock_fallback"

    # ── Tier 1: Stagehand AI browser ─────────────────────────────────────────
    if api_key:
        # OpenRouter routes to a wide range of models; use a cheap but capable one
        model_name = "openai/gpt-4o-mini"
        try:
            result_data = await asyncio.wait_for(
                _scrape_with_stagehand(target_url, api_key, model_name),
                timeout=50.0,
            )
            if result_data:
                source = "stagehand_browser"
                logger.info(
                    "Stagehand browser extraction succeeded for %s", vendor_name
                )
        except asyncio.TimeoutError:
            logger.warning(
                "Stagehand timed out after 50 s for %s; trying httpx fallback",
                vendor_name,
            )
        except Exception as e:
            logger.warning(
                "Stagehand failed for %s (%s); trying httpx fallback", vendor_name, e
            )

    # ── Tier 2: Atlassian Statuspage JSON API ────────────────────────────────
    if result_data is None:
        result_data = await _scrape_with_httpx(vendor_key)
        if result_data:
            source = "statuspage_api"
            logger.info("Statuspage API data retrieved for %s", vendor_name)

    # ── Tier 3: Curated mock data ─────────────────────────────────────────────
    if result_data is None:
        result_data = MOCK_VENDOR_RESPONSES.get(
            vendor_key,
            {
                "has_active_incident": True,
                "incident_title": f"{vendor_name} API Incident",
                "incident_description": (
                    "We are currently investigating reports of degradation "
                    "affecting connectivity to our core endpoints."
                ),
                "affected_services": ["Core API"],
                "status_summary": (
                    f"Service degradation detected on {vendor_name} endpoints."
                ),
                "current_status": "degraded_performance",
                "live_data": False,
            },
        )
        source = "mock_fallback"
        logger.info("Using mock data fallback for %s", vendor_name)

    return json.dumps(
        {
            "vendor": vendor_name,
            "url": target_url,
            "data": result_data,
            "error": None,
            "source": source,
        }
    )

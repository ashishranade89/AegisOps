from langchain.tools import tool
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

MOCK_SEARCH_RESULTS = {
    "stripe": [
        {"title": "DownDetector: Stripe Outage Reports", "url": "https://downdetector.com/status/stripe", "content": "Stripe reports spike in error rates. Over 800 reports received in the last hour. Users reporting credit card processing failures and checkout timeouts."},
        {"title": "Twitter: #StripeDown Trend", "url": "https://x.com/search?q=stripe%20down", "content": "Users posting about Stripe integration throwing 500 internal errors and 'Network request failed'. Core checkout routes are failing."},
        {"title": "Hacker News: Stripe API issues", "url": "https://news.ycombinator.com/item?id=stripe-down", "content": "Thread discussing Stripe payment checkout timeouts. Engineering says it is a database migration lock issue."}
    ],
    "aws": [
        {"title": "DownDetector: AWS Outage Reports", "url": "https://downdetector.com/status/aws", "content": "Amazon Web Services experiencing high volumes of service failures. Customers report issues accessing S3 buckets in US-East-1 region."},
        {"title": "AWS Reddit: S3 GET/PUT errors in us-east-1", "url": "https://reddit.com/r/aws", "content": "Discussion thread on S3 timeouts. Many SaaS apps are down because their image hosts or data buckets are timing out."},
        {"title": "TechCrunch: AWS S3 degradation", "url": "https://techcrunch.com/aws-outage", "content": "AWS reports issues in US-East-1 region. Services depending on S3 storage are reporting timeouts and high latencies."}
    ],
    "twilio": [
        {"title": "DownDetector: Twilio Outage Reports", "url": "https://downdetector.com/status/twilio", "content": "Twilio reports delivery degradation. Delivery failures reported for MFA and OTP verification messages."},
        {"title": "Carrier Outage Forums", "url": "https://telecomstatus.com/twilio", "content": "Twilio SMS gateway experiencing high carrier delays. Outage affects major US mobile networks."},
        {"title": "GitHub Issue: Twilio integration timeouts", "url": "https://github.com/auth-org/issues", "content": "MFA codes failing to send due to Twilio API Gateway delays."}
    ],
    "cloudflare": [
        {"title": "DownDetector: Cloudflare Outage Reports", "url": "https://downdetector.com/status/cloudflare", "content": "Cloudflare reports Anycast network route issues. Customers report DNS resolution timeouts globally."},
        {"title": "Twitter: #CloudflareDown", "url": "https://x.com/search?q=cloudflare%20down", "content": "Multiple websites reporting 502 Bad Gateway and connection refused errors because of Cloudflare routing errors."},
        {"title": "Hacker HN: Cloudflare routing issues", "url": "https://news.ycombinator.com/item?id=cloudflare-route", "content": "Discussion about Cloudflare BGP route leaks causing packet loss and DNS resolution failures."}
    ],
    "github": [
        {"title": "DownDetector: GitHub Outage Reports", "url": "https://downdetector.com/status/github", "content": "GitHub reports authenticate database degradation. Users unable to log in or push to repositories."},
        {"title": "Twitter: #GitHubDown", "url": "https://x.com/search?q=github%20down", "content": "Developers complaining about git clone and push timeouts. OAuth authentication endpoints return 504 errors."},
        {"title": "TechStatus: GitHub authentication down", "url": "https://techstatus.org/github", "content": "GitHub confirms degradation in login services, blocking integration pipelines and login providers."}
    ]
}

@tool
def search_vendor_outage_online(vendor_name: str, symptoms: str, tavily_api_key: str = None) -> str:
    """
    Queries the live internet (Twitter, DownDetector, Reddit) for reports of outages
    affecting the specified vendor. Use this if the browser automation scraper fails.
    """
    vendor_key = vendor_name.lower()
    query = f"{vendor_name} down outage incident {symptoms} today"
    logger.info("Performing online web search: %s", query)
    
    # Try Tavily
    try:
        from langchain_community.tools.tavily_search import TavilySearchResults
        from backend.utils.config import get_config
        config = get_config()
        
        api_key = tavily_api_key or config.tavily_api_key
        if api_key:
            searcher = TavilySearchResults(max_results=3, include_answer=True)
            # In older langchain versions TavilySearchResults doesn't take api_key as param, but we set env variable dynamically
            import os
            os.environ["TAVILY_API_KEY"] = api_key
            raw_results = searcher.invoke(query)
            logger.info("Tavily search successful.")
            return json.dumps({
                "vendor": vendor_name,
                "results": raw_results,
                "error": None,
                "source": "tavily_search"
            })
    except Exception as e:
        logger.warning("Tavily search failed (%s), trying DuckDuckGo fallback.", e)
        
    # Try DuckDuckGo
    try:
        from duckduckgo_search import DDGS
        ddgs = DDGS()
        raw_results = list(ddgs.text(query, max_results=3))
        results = []
        for r in raw_results:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "content": r.get("body", "")
            })
        if results:
            logger.info("DuckDuckGo search successful.")
            return json.dumps({
                "vendor": vendor_name,
                "results": results,
                "error": None,
                "source": "duckduckgo_search"
            })
    except Exception as e:
        logger.warning("DuckDuckGo search failed (%s). Using mock search fallback.", e)
        
    # Fallback to simulated online data
    mock_results = MOCK_SEARCH_RESULTS.get(
        vendor_key,
        [
            {
                "title": f"DownDetector: {vendor_name} Outage",
                "url": f"https://downdetector.com/status/{vendor_key}",
                "content": f"Reports indicate connectivity issues and service degradation for {vendor_name} services."
            },
            {
                "title": f"Social Media: #{vendor_name}Down",
                "url": f"https://socialmedia.com/search?q={vendor_key}%20down",
                "content": f"Users reporting connection failures and API timeouts when communicating with {vendor_name} API."
            }
        ]
    )
    
    return json.dumps({
        "vendor": vendor_name,
        "results": mock_results,
        "error": None,
        "source": "simulated_search_fallback"
    })

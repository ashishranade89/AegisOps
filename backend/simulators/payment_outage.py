import uuid
from datetime import datetime, timezone

SCENARIOS = {
    "stripe_outage": {
        "name": "Stripe Gateway Outage",
        "description": "Stripe payment gateway API is timing out and throwing connection refused errors, causing payment failures on checkout pages.",
        "suspected_vendor": "Stripe",
        "severity": "P1",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "ERROR", "service": "payment-service", "message": "Stripe API call failed: StripeConnectionError - Request timed out after 30000ms"},
            {"timestamp": "2026-06-12T15:00:05Z", "level": "ERROR", "service": "api-gateway", "message": "payment-service endpoint POST /charge returned 504 Gateway Timeout"},
            {"timestamp": "2026-06-12T15:00:12Z", "level": "INFO", "service": "order-service", "message": "User cancelled checkout checkout_stripe_98a72e after 45s wait"}
        ],
        "metrics": {
            "payment_gateway_errors": 92.5,
            "payment_gateway_latency_ms": 28950.0,
            "http_error_rate_5xx": 0.18
        },
        "alerts": [
            {"severity": "CRITICAL", "service": "payment-service", "message": "Payment checkout failure rate exceeded 90% (avg 92.5% in 5m)"}
        ]
    },
    "aws_s3_degradation": {
        "name": "AWS S3 Read Degradation",
        "description": "S3 bucket reading is experiencing 500 Server Errors in us-east-1, failing user profile image loads and file attachments.",
        "suspected_vendor": "AWS",
        "severity": "P2",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "ERROR", "service": "media-service", "message": "AWS S3 GET bucket 'user-uploads-prod' failed: S3ServiceException - Internal Error (Status Code: 500)"},
            {"timestamp": "2026-06-12T15:00:08Z", "level": "WARN", "service": "profile-service", "message": "failed to retrieve profile picture for user_9801: S3 bucket timeout after 10000ms"}
        ],
        "metrics": {
            "s3_api_error_rate": 0.74,
            "s3_read_latency_ms": 8450.0
        },
        "alerts": [
            {"severity": "WARNING", "service": "media-service", "message": "AWS S3 GET API error rate at 74% in us-east-1"}
        ]
    },
    "twilio_sms_delay": {
        "name": "Twilio SMS Gateway Delay",
        "description": "Twilio SMS delivery queue is backed up, delaying OTP and MFA codes by up to 20 minutes.",
        "suspected_vendor": "Twilio",
        "severity": "P2",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "WARN", "service": "notification-service", "message": "Twilio SMS status callback delayed: Message SID SM87a2d is queued for 640 seconds"},
            {"timestamp": "2026-06-12T15:00:10Z", "level": "ERROR", "service": "auth-service", "message": "User_8271 MFA validation failed: OTP code expired before arrival"}
        ],
        "metrics": {
            "twilio_delivery_failure_rate": 0.28,
            "sms_queue_duration_seconds": 820.0
        },
        "alerts": [
            {"severity": "WARNING", "service": "auth-service", "message": "MFA Delivery delays exceeding SLA (average 13.6 minutes delay)"}
        ]
    },
    "cloudflare_dns_failure": {
        "name": "Cloudflare DNS Resolution Outage",
        "description": "Cloudflare DNS resolvers are failing to resolve external callback webhooks, breaking incoming partner webhooks.",
        "suspected_vendor": "Cloudflare",
        "severity": "P1",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "ERROR", "service": "webhook-receiver", "message": "DNS lookup failed for billing.stripe.com: NameOrServiceNotKnown"},
            {"timestamp": "2026-06-12T15:00:04Z", "level": "ERROR", "service": "ingress-controller", "message": "Cloudflare BGP route leakage causing connection timeout on edge servers"}
        ],
        "metrics": {
            "dns_resolution_error_rate": 0.85,
            "webhook_delivery_failures": 420.0
        },
        "alerts": [
            {"severity": "CRITICAL", "service": "ingress-controller", "message": "External webhook ingress failing: DNS resolution timeouts on Cloudflare gateways"}
        ]
    },
    "github_auth_error": {
        "name": "GitHub OAuth Degradation",
        "description": "GitHub OAuth login is throwing 502 Bad Gateway and auth server timeouts, blocking user logins.",
        "suspected_vendor": "GitHub",
        "severity": "P3",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "ERROR", "service": "auth-service", "message": "GitHub OAuth handshake failed: 502 Bad Gateway from github.com/login/oauth/access_token"},
            {"timestamp": "2026-06-12T15:00:15Z", "level": "WARN", "service": "api-gateway", "message": "GET /login/github callback timed out after 10 seconds"}
        ],
        "metrics": {
            "oauth_login_failure_rate": 0.65,
            "oauth_handshake_latency_ms": 10000.0
        },
        "alerts": [
            {"severity": "WARNING", "service": "auth-service", "message": "GitHub OAuth Login failure rate at 65% in last 10m"}
        ]
    },
    "sendgrid_email_bounces": {
        "name": "SendGrid Email Delivery Failures",
        "description": "Transactional email service is dropping 40% of outbound emails — password resets and order confirmations not reaching users.",
        "suspected_vendor": "SendGrid",
        "severity": "P2",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "ERROR", "service": "notification-service", "message": "SendGrid API returned 503 Service Unavailable for bulk email dispatch batch-921"},
            {"timestamp": "2026-06-12T15:00:20Z", "level": "WARN", "service": "auth-service", "message": "Password reset email bounce for user_7741: SMTP relay timeout"},
            {"timestamp": "2026-06-12T15:01:00Z", "level": "ERROR", "service": "order-service", "message": "Order confirmation email ID ORD-88201 failed: SendGrid webhook delivery_failed event received"}
        ],
        "metrics": {
            "email_bounce_rate": 0.42,
            "smtp_relay_latency_ms": 12800.0,
            "sendgrid_delivery_rate": 0.58
        },
        "alerts": [
            {"severity": "WARNING", "service": "notification-service", "message": "Email delivery rate dropped to 58% — SendGrid API returning 503 errors (42% bounce rate in 15m)"}
        ]
    },
    "datadog_monitoring_gap": {
        "name": "Datadog APM Monitoring Blackout",
        "description": "Datadog agent is failing to flush metrics to the intake API — dashboards showing flat lines and alerting system is blind.",
        "suspected_vendor": "Datadog",
        "severity": "P2",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "ERROR", "service": "datadog-agent", "message": "Failed to flush metrics: POST https://api.datadoghq.com/api/v1/series returned 502 Bad Gateway"},
            {"timestamp": "2026-06-12T15:00:30Z", "level": "WARN", "service": "k8s-node-01", "message": "datadog-agent pod CrashLoopBackOff: intake.datadoghq.com connection refused"},
            {"timestamp": "2026-06-12T15:01:00Z", "level": "CRITICAL", "service": "alerting-service", "message": "No Datadog metrics received for 3 minutes — monitoring blackout in progress"}
        ],
        "metrics": {
            "datadog_agent_flush_error_rate": 1.0,
            "monitoring_gap_minutes": 3.5,
            "alert_suppression_pct": 100.0
        },
        "alerts": [
            {"severity": "CRITICAL", "service": "observability-platform", "message": "MONITORING BLACKOUT: Datadog intake unreachable for 3.5m — all dashboards dark, alerting disabled"}
        ]
    },
    "auth0_sso_degradation": {
        "name": "Auth0 SSO Login Failures",
        "description": "Auth0 tenant experiencing elevated error rates on /authorize endpoint — users unable to log in via corporate SSO.",
        "suspected_vendor": "Auth0",
        "severity": "P1",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "ERROR", "service": "auth-service", "message": "Auth0 /oauth/token returned 429 TooManyRequests for tenant corp-sso.us.auth0.com"},
            {"timestamp": "2026-06-12T15:00:10Z", "level": "ERROR", "service": "frontend-bff", "message": "PKCE flow failed: Auth0 /authorize returned 503 during code exchange"},
            {"timestamp": "2026-06-12T15:00:25Z", "level": "WARN", "service": "session-manager", "message": "Token refresh failed for 8,200 active sessions — users logged out globally"}
        ],
        "metrics": {
            "auth0_error_rate": 0.78,
            "sso_login_success_rate": 0.22,
            "active_session_failures": 8200.0
        },
        "alerts": [
            {"severity": "CRITICAL", "service": "auth-service", "message": "Auth0 SSO login success rate dropped to 22% — 8,200 users logged out. P1 incident declared."}
        ]
    },
    "pagerduty_alert_storm": {
        "name": "PagerDuty Notification Flood",
        "description": "PagerDuty alert routing is broken — on-call engineer receiving thousands of duplicate pages per minute while critical alerts are being dropped.",
        "suspected_vendor": "PagerDuty",
        "severity": "P2",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "ERROR", "service": "alerting-service", "message": "PagerDuty events API returned 429: rate limit exceeded — 3,200 events queued"},
            {"timestamp": "2026-06-12T15:00:15Z", "level": "WARN", "service": "incident-router", "message": "Deduplication logic bypassed: duplicate page P-ALERT-9901 delivered 847 times to on-call"},
            {"timestamp": "2026-06-12T15:01:00Z", "level": "ERROR", "service": "escalation-engine", "message": "Critical SLA breach alert for checkout-service dropped — PagerDuty delivery queue full"}
        ],
        "metrics": {
            "pagerduty_delivery_failure_rate": 0.35,
            "duplicate_pages_per_minute": 847.0,
            "dropped_critical_alerts": 12.0
        },
        "alerts": [
            {"severity": "WARNING", "service": "alerting-service", "message": "PagerDuty API rate-limited: 35% alert delivery failure, 12 critical alerts dropped in last 10m"}
        ]
    },
    "redis_cache_eviction": {
        "name": "Redis Cache Cluster Eviction Storm",
        "description": "Redis cluster memory exhausted — mass key eviction causing cache miss spike, cascading to database overload and API latency explosion.",
        "suspected_vendor": "Redis",
        "severity": "P1",
        "logs": [
            {"timestamp": "2026-06-12T15:00:00Z", "level": "CRITICAL", "service": "redis-cluster", "message": "Memory usage at 99.8% (7.98GB/8GB) — LRU eviction rate 45,000 keys/sec"},
            {"timestamp": "2026-06-12T15:00:05Z", "level": "ERROR", "service": "session-service", "message": "Cache miss rate 94.2% — all 120k active sessions falling through to PostgreSQL"},
            {"timestamp": "2026-06-12T15:00:12Z", "level": "CRITICAL", "service": "postgres-primary", "message": "Connection pool exhausted: 500/500 connections active, queries queueing — avg latency 8400ms"}
        ],
        "metrics": {
            "redis_memory_usage_pct": 99.8,
            "cache_miss_rate": 0.942,
            "database_connection_pool_pct": 100.0,
            "api_p99_latency_ms": 12400.0
        },
        "alerts": [
            {"severity": "CRITICAL", "service": "infrastructure", "message": "Redis eviction storm: cache miss 94%, DB pool at 100%, API P99 latency 12.4s — cascading failure in progress"}
        ]
    }
}

def generate_payment_scenario(scenario_key: str) -> dict:
    """Generates the data structure for a given simulated outage key."""
    if scenario_key not in SCENARIOS:
        raise ValueError(f"Unknown scenario key: {scenario_key}")
        
    s = SCENARIOS[scenario_key]
    return {
        "incident_id": f"INC-{uuid.uuid4().hex[:8].upper()}",
        "scenario_type": scenario_key,
        "description": s["description"],
        "suspected_vendor": s["suspected_vendor"],
        "severity": s["severity"],
        "raw_logs": s["logs"],
        "raw_metrics": s["metrics"],
        "alerts": s["alerts"],
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

def list_payment_scenarios() -> list[dict]:
    """Returns a list of all scenarios with their metadata."""
    return [
        {"scenario_type": k, "name": v["name"], "description": v["description"]}
        for k, v in SCENARIOS.items()
    ]

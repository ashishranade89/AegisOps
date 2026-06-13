from fastapi import HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from backend.utils.config import get_config

_bearer = HTTPBearer(auto_error=False)


async def require_api_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    """Optional bearer auth — enforced only when INCIDENT_API_KEY is configured."""
    expected = get_config().incident_api_key
    if not expected:
        return

    token = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    if not token:
        token = request.headers.get("X-API-Key")
    if not token:
        token = request.query_params.get("api_key")

    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

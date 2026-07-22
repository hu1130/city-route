from fastapi import HTTPException, Request

from app.core.config import get_settings
from app.services.api_rate_limiter import RateLimitExceeded, check_rate_limit


def request_key(request: Request, fallback: str = "anonymous") -> str:
    client_id = request.headers.get("X-Client-Id")
    if client_id and client_id.strip():
        return client_id.strip()[:128]
    if request.client and request.client.host:
        return request.client.host
    return fallback


def enforce_poi_rate_limit(request: Request) -> None:
    settings = get_settings()
    enforce_rate_limit(
        name="poi",
        key=request_key(request),
        max_requests=settings.poi_rate_limit_max_requests,
        window_seconds=settings.poi_rate_limit_window_seconds,
    )


def enforce_route_rate_limit(key: str) -> None:
    settings = get_settings()
    enforce_rate_limit(
        name="route",
        key=key,
        max_requests=settings.route_rate_limit_max_requests,
        window_seconds=settings.route_rate_limit_window_seconds,
    )


def enforce_rate_limit(*, name: str, key: str, max_requests: int, window_seconds: int) -> None:
    try:
        check_rate_limit(name=name, key=key, max_requests=max_requests, window_seconds=window_seconds)
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Try again later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

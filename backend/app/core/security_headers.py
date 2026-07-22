from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import Request, Response

from app.core.config import get_settings


async def add_security_headers(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = getattr(request.state, "request_id", None) or normalized_request_id(request.headers.get("X-Request-Id"))
    request.state.request_id = request_id

    response = await call_next(request)
    settings = get_settings()

    response.headers.setdefault("X-Request-Id", request_id)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")

    if settings.app_env == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

    return response


def normalized_request_id(value: str | None) -> str:
    if value:
        candidate = value.strip()
        if 1 <= len(candidate) <= 96 and all(char.isalnum() or char in "-_." for char in candidate):
            return candidate
    return uuid4().hex

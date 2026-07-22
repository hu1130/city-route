from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from app.core.security_headers import normalized_request_id

logger = logging.getLogger("city_route.requests")


async def log_request(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    start = time.perf_counter()
    request_id = getattr(request.state, "request_id", None) or normalized_request_id(request.headers.get("X-Request-Id"))
    request.state.request_id = request_id
    response: Response | None = None

    try:
        response = await call_next(request)
        return response
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        status_code = response.status_code if response is not None else 500
        if response is not None:
            response.headers.setdefault("X-Request-Id", request_id)
            response.headers.setdefault("X-Process-Time-Ms", f"{duration_ms:.2f}")

        client_host = request.client.host if request.client else "-"
        logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": status_code,
                "duration_ms": round(duration_ms, 2),
                "client": client_host,
            },
        )

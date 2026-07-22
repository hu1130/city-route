from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.logging_config import configure_logging

logger = logging.getLogger("city_route.ops.monitor")


@dataclass(frozen=True)
class Endpoint:
    name: str
    url: str
    require_ready: bool = False


def check_endpoint(endpoint: Endpoint, timeout_seconds: float = 8.0) -> tuple[bool, str]:
    try:
        with urlopen(endpoint.url, timeout=timeout_seconds) as response:
            body = response.read()
            if response.status != 200:
                return False, f"HTTP {response.status}"
            if endpoint.require_ready:
                payload = json.loads(body.decode("utf-8"))
                if payload.get("ok") is not True:
                    return False, "readiness returned ok=false"
            return True, "ok"
    except HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        return False, exc.__class__.__name__


def send_webhook(url: str, text: str) -> None:
    if not url:
        return
    payload = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=8) as response:
        if response.status >= 300:
            raise RuntimeError(f"Webhook returned HTTP {response.status}")


def configured_endpoints() -> list[Endpoint]:
    endpoints = [
        Endpoint("backend-health", os.getenv("MONITOR_BACKEND_HEALTH_URL", "http://backend:8011/health")),
        Endpoint(
            "backend-readiness",
            os.getenv("MONITOR_BACKEND_READINESS_URL", "http://backend:8011/api/system/readiness"),
            require_ready=True,
        ),
        Endpoint("frontend", os.getenv("MONITOR_FRONTEND_URL", "http://frontend:3000")),
    ]
    public_url = os.getenv("MONITOR_PUBLIC_URL", "").strip()
    if public_url:
        endpoints.append(Endpoint("public-entry", public_url))
    return endpoints


def main() -> int:
    configure_logging(os.getenv("CITY_ROUTE_LOG_LEVEL", "INFO"))
    interval_seconds = max(int(os.getenv("MONITOR_INTERVAL_SECONDS", "60")), 15)
    failure_threshold = max(int(os.getenv("MONITOR_FAILURE_THRESHOLD", "3")), 1)
    webhook_url = os.getenv("ALERT_WEBHOOK_URL", "").strip()
    consecutive_failures = 0
    incident_open = False

    while True:
        failures = []
        for endpoint in configured_endpoints():
            ok, detail = check_endpoint(endpoint)
            if not ok:
                failures.append(f"{endpoint.name}: {detail}")

        if failures:
            consecutive_failures += 1
            logger.error("health_check_failed", extra={"status": "; ".join(failures)})
            if consecutive_failures >= failure_threshold and not incident_open:
                message = "此刻路线生产服务异常：" + "；".join(failures)
                try:
                    send_webhook(webhook_url, message)
                except Exception:
                    logger.exception("alert_webhook_failed")
                incident_open = True
        else:
            if incident_open:
                try:
                    send_webhook(webhook_url, "此刻路线生产服务已恢复。")
                except Exception:
                    logger.exception("recovery_webhook_failed")
            consecutive_failures = 0
            incident_open = False
            logger.info("health_check_passed")

        time.sleep(interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())

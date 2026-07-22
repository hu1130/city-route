from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.core.config import get_settings


@dataclass
class LoginBucket:
    failures: list[float] = field(default_factory=list)


class LoginRateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many login attempts.")
        self.retry_after_seconds = retry_after_seconds


_BUCKETS: dict[str, LoginBucket] = {}


def check_login_allowed(key: str, now: float | None = None) -> None:
    settings = get_settings()
    if settings.login_max_attempts <= 0:
        return

    current_time = current_timestamp(now)
    bucket = _BUCKETS.get(key)
    if bucket is None:
        return

    prune(bucket, current_time, settings.login_window_seconds)
    if len(bucket.failures) < settings.login_max_attempts:
        return

    oldest = bucket.failures[0]
    retry_after = max(1, int(settings.login_window_seconds - (current_time - oldest)))
    raise LoginRateLimitExceeded(retry_after)


def record_login_failure(key: str, now: float | None = None) -> None:
    settings = get_settings()
    if settings.login_max_attempts <= 0:
        return

    current_time = current_timestamp(now)
    bucket = _BUCKETS.setdefault(key, LoginBucket())
    prune(bucket, current_time, settings.login_window_seconds)
    bucket.failures.append(current_time)


def clear_login_failures(key: str) -> None:
    _BUCKETS.pop(key, None)


def reset_login_rate_limits() -> None:
    _BUCKETS.clear()


def prune(bucket: LoginBucket, now: float, window_seconds: int) -> None:
    cutoff = now - max(1, window_seconds)
    bucket.failures = [value for value in bucket.failures if value >= cutoff]


def current_timestamp(value: float | None) -> float:
    return value if value is not None else time.time()

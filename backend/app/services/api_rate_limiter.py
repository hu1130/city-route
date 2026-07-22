from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class RequestBucket:
    hits: list[float] = field(default_factory=list)


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many requests.")
        self.retry_after_seconds = retry_after_seconds


_BUCKETS: dict[str, RequestBucket] = {}


def check_rate_limit(
    *,
    name: str,
    key: str,
    max_requests: int,
    window_seconds: int,
    now: float | None = None,
) -> None:
    if max_requests <= 0:
        return

    current_time = now if now is not None else time.time()
    bucket_key = f"{name}:{key}"
    bucket = _BUCKETS.setdefault(bucket_key, RequestBucket())
    prune(bucket, current_time, window_seconds)

    if len(bucket.hits) >= max_requests:
        oldest = bucket.hits[0]
        retry_after = max(1, int(max(1, window_seconds) - (current_time - oldest)))
        raise RateLimitExceeded(retry_after)

    bucket.hits.append(current_time)


def reset_api_rate_limits() -> None:
    _BUCKETS.clear()


def prune(bucket: RequestBucket, now: float, window_seconds: int) -> None:
    cutoff = now - max(1, window_seconds)
    bucket.hits = [value for value in bucket.hits if value >= cutoff]

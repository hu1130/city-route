from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.logging_config import configure_logging
from app.tools.database import backup_mysql

logger = logging.getLogger("city_route.ops.backup")


def prune_backups(directory: Path, retention_days: int, *, now: datetime | None = None) -> int:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=max(retention_days, 1))
    removed = 0
    for path in directory.glob("city-route-mysql-*.json"):
        modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        if modified < cutoff:
            path.unlink(missing_ok=True)
            removed += 1
    return removed


def run_backup(directory: Path, retention_days: int) -> bool:
    directory.mkdir(parents=True, exist_ok=True)
    success = backup_mysql(str(directory)) == 0
    if not success:
        logger.error("database_backup_failed")
        return False
    removed = prune_backups(directory, retention_days)
    logger.info("database_backup_completed", extra={"path": str(directory), "removed": removed})
    return True


def main() -> int:
    configure_logging(os.getenv("CITY_ROUTE_LOG_LEVEL", "INFO"))
    directory = Path(os.getenv("BACKUP_DIRECTORY", "/backups"))
    interval_seconds = max(int(os.getenv("BACKUP_INTERVAL_SECONDS", "86400")), 300)
    retention_days = max(int(os.getenv("BACKUP_RETENTION_DAYS", "14")), 1)

    while True:
        run_backup(directory, retention_days)
        time.sleep(interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())

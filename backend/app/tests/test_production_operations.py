import json
import logging
import os
from datetime import datetime, timedelta, timezone

import pytest

from app.core.logging_config import JsonFormatter
from app.storage import memory_store
from app.tools.backup_loop import prune_backups


class ProductionSettings:
    app_env = "production"
    persistence_enabled = True
    mysql_enabled = True


class FailingMysqlStore:
    @staticmethod
    def ping():
        raise ConnectionError("database unavailable")


def test_production_mysql_failure_never_falls_back_to_json(monkeypatch):
    memory_store.clear_mysql_fallback()
    with monkeypatch.context() as patch:
        patch.setattr(memory_store, "get_settings", lambda: ProductionSettings())
        patch.setattr(memory_store, "mysql_enabled", lambda: True)
        patch.setattr(memory_store, "mysql_store", lambda: FailingMysqlStore())

        with pytest.raises(RuntimeError, match="MySQL operation failed"):
            memory_store.call_mysql(FailingMysqlStore.ping)


def test_production_storage_status_reports_mysql_failure(monkeypatch):
    memory_store.clear_mysql_fallback()
    with monkeypatch.context() as patch:
        patch.setattr(memory_store, "get_settings", lambda: ProductionSettings())
        patch.setattr(memory_store, "mysql_enabled", lambda: True)
        patch.setattr(memory_store, "mysql_store", lambda: FailingMysqlStore())

        status = memory_store.storage_status()

    assert status["backend"] == "mysql"
    assert status["status"] == "error"
    assert "MySQL" in status["detail"]


def test_json_formatter_emits_searchable_request_fields():
    record = logging.LogRecord(
        name="city_route.requests",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request_completed",
        args=(),
        exc_info=None,
    )
    record.request_id = "request-123"
    record.method = "GET"
    record.path = "/health"
    record.status = 200
    record.duration_ms = 12.5

    payload = json.loads(JsonFormatter().format(record))

    assert payload["message"] == "request_completed"
    assert payload["request_id"] == "request-123"
    assert payload["path"] == "/health"
    assert payload["status"] == 200


def test_prune_backups_removes_only_expired_backup_files(tmp_path):
    now = datetime(2026, 7, 21, tzinfo=timezone.utc)
    expired = tmp_path / "city-route-mysql-20260701-000000.json"
    current = tmp_path / "city-route-mysql-20260720-000000.json"
    unrelated = tmp_path / "notes.json"
    for path in (expired, current, unrelated):
        path.write_text("{}", encoding="utf-8")

    expired_time = (now - timedelta(days=20)).timestamp()
    current_time = (now - timedelta(days=1)).timestamp()
    os.utime(expired, (expired_time, expired_time))
    os.utime(current, (current_time, current_time))

    removed = prune_backups(tmp_path, retention_days=14, now=now)

    assert removed == 1
    assert not expired.exists()
    assert current.exists()
    assert unrelated.exists()

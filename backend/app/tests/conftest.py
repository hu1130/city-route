import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.services.api_rate_limiter import reset_api_rate_limits
from app.services.login_rate_limiter import reset_login_rate_limits
from app.storage.memory_store import reset_store


@pytest.fixture(autouse=True)
def clean_store(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("CITY_ROUTE_USE_AMAP", "false")
    get_settings.cache_clear()
    reset_api_rate_limits()
    reset_login_rate_limits()
    reset_store()
    yield
    get_settings.cache_clear()
    reset_api_rate_limits()
    reset_login_rate_limits()
    reset_store()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)

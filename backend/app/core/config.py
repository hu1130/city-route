from functools import lru_cache
from os import environ
from pathlib import Path


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.lstrip("\ufeff").strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _env_value(name: str, env_file: dict[str, str], default: str = "") -> str:
    process_value = environ.get(name)
    if process_value is not None and process_value.strip():
        return process_value.strip()
    return env_file.get(name, default).strip()


def _bool_env(name: str, env_file: dict[str, str], default: bool = True) -> bool:
    value = _env_value(name, env_file, str(default)).lower()
    return value not in {"0", "false", "no", "off"}


def _int_env(name: str, env_file: dict[str, str], default: int) -> int:
    value = _env_value(name, env_file, str(default))
    try:
        return int(value)
    except ValueError:
        return default


class Settings:
    def __init__(self) -> None:
        project_root = Path(__file__).resolve().parents[3]
        env_file = _read_env_file(project_root / ".env")

        self.app_env = _env_value("APP_ENV", env_file, "development")
        self.log_level = _env_value("CITY_ROUTE_LOG_LEVEL", env_file, "INFO").upper()
        self.amap_api_key = _env_value("AMAP_API_KEY", env_file)
        self.amap_base_url = _env_value("AMAP_BASE_URL", env_file, "https://restapi.amap.com")
        self.use_amap = _bool_env("CITY_ROUTE_USE_AMAP", env_file, True)
        self.deepseek_api_key = _env_value("DEEPSEEK_API_KEY", env_file)
        self.deepseek_base_url = _env_value("DEEPSEEK_BASE_URL", env_file, "https://api.deepseek.com")
        self.deepseek_model = _env_value("DEEPSEEK_MODEL", env_file, "deepseek-v4-flash")
        self.use_deepseek = _bool_env("CITY_ROUTE_USE_DEEPSEEK", env_file, True)
        self.use_persistence = _bool_env("CITY_ROUTE_USE_PERSISTENCE", env_file, True)
        self.storage_backend = _env_value("CITY_ROUTE_STORAGE_BACKEND", env_file, "json")
        self.database_url = _env_value("DATABASE_URL", env_file)
        self.auth_secret = _env_value(
            "CITY_ROUTE_AUTH_SECRET",
            env_file,
            "local-dev-auth-secret-change-before-deploy",
        )
        self.auth_token_ttl_seconds = _int_env("CITY_ROUTE_AUTH_TOKEN_TTL_SECONDS", env_file, 60 * 60 * 24 * 30)
        self.login_max_attempts = _int_env("CITY_ROUTE_LOGIN_MAX_ATTEMPTS", env_file, 5)
        self.login_window_seconds = _int_env("CITY_ROUTE_LOGIN_WINDOW_SECONDS", env_file, 15 * 60)
        self.poi_rate_limit_max_requests = _int_env("CITY_ROUTE_POI_RATE_LIMIT_MAX_REQUESTS", env_file, 60)
        self.poi_rate_limit_window_seconds = _int_env("CITY_ROUTE_POI_RATE_LIMIT_WINDOW_SECONDS", env_file, 60)
        self.route_rate_limit_max_requests = _int_env("CITY_ROUTE_ROUTE_RATE_LIMIT_MAX_REQUESTS", env_file, 12)
        self.route_rate_limit_window_seconds = _int_env("CITY_ROUTE_ROUTE_RATE_LIMIT_WINDOW_SECONDS", env_file, 60)
        self.cors_origins = [
            origin.strip()
            for origin in _env_value(
                "CITY_ROUTE_CORS_ORIGINS",
                env_file,
                "http://127.0.0.1:3000,http://localhost:3000",
            ).split(",")
            if origin.strip()
        ]
        self.storage_path = _env_value(
            "CITY_ROUTE_STORAGE_PATH",
            env_file,
            str(project_root / "backend" / "data" / "store.json"),
        )

    @property
    def amap_enabled(self) -> bool:
        return self.use_amap and self.app_env != "test" and bool(self.amap_api_key)

    @property
    def deepseek_enabled(self) -> bool:
        return self.use_deepseek and self.app_env != "test" and bool(self.deepseek_api_key)

    @property
    def persistence_enabled(self) -> bool:
        return self.use_persistence and self.app_env != "test"

    @property
    def mysql_enabled(self) -> bool:
        return self.persistence_enabled and self.storage_backend.lower() == "mysql" and bool(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()

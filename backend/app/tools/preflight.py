from __future__ import annotations

import argparse
from dataclasses import dataclass

from app.core.config import get_settings
from app.storage import mysql_store

DEFAULT_AUTH_SECRET = "local-dev-auth-secret-change-before-deploy"
LOCAL_ORIGIN_MARKERS = ("127.0.0.1", "localhost")


@dataclass
class CheckResult:
    status: str
    name: str
    detail: str


def main() -> int:
    parser = argparse.ArgumentParser(description="City Route deployment preflight checks")
    parser.add_argument("--production", action="store_true", help="Enforce production deployment requirements.")
    args = parser.parse_args()

    results = run_checks(production=args.production)
    for result in results:
        print(f"[{result.status.upper()}] {result.name}: {result.detail}")

    failed = [result for result in results if result.status == "fail"]
    if failed:
        print(f"Preflight failed: {len(failed)} blocking issue(s).")
        return 1

    warnings = [result for result in results if result.status == "warn"]
    if warnings:
        print(f"Preflight completed with {len(warnings)} warning(s).")
        return 0

    print("Preflight passed.")
    return 0


def run_checks(*, production: bool) -> list[CheckResult]:
    settings = get_settings()
    results = [
        check_app_env(settings.app_env, production=production),
        check_auth_secret(settings.auth_secret, production=production),
        check_persistence(
            settings.use_persistence,
            settings.storage_backend,
            settings.database_url,
            production=production,
        ),
        check_mysql_connection(settings.mysql_enabled, production=production),
        check_cors(settings.cors_origins, production=production),
        check_amap(settings.use_amap, settings.amap_api_key, production=production),
        check_deepseek(settings.use_deepseek, settings.deepseek_api_key, production=production),
    ]
    return results


def check_app_env(app_env: str, *, production: bool) -> CheckResult:
    if production and app_env != "production":
        return fail("APP_ENV", "APP_ENV must be production for production preflight.")
    if app_env == "production":
        return ok("APP_ENV", "production")
    return warn("APP_ENV", f"current value is {app_env}; acceptable for local development.")


def check_auth_secret(auth_secret: str, *, production: bool) -> CheckResult:
    if not auth_secret or auth_secret == DEFAULT_AUTH_SECRET:
        return fail_or_warn(
            production,
            "CITY_ROUTE_AUTH_SECRET",
            "auth secret is missing or still uses the local default.",
        )
    if len(auth_secret) < 32:
        return fail_or_warn(production, "CITY_ROUTE_AUTH_SECRET", "auth secret should be at least 32 characters.")
    return ok("CITY_ROUTE_AUTH_SECRET", "configured")


def check_persistence(
    use_persistence: bool,
    storage_backend: str,
    database_url: str,
    *,
    production: bool,
) -> CheckResult:
    if not use_persistence:
        return fail_or_warn(production, "Persistence", "CITY_ROUTE_USE_PERSISTENCE must be enabled.")
    if storage_backend.lower() != "mysql":
        return fail_or_warn(production, "Persistence", "CITY_ROUTE_STORAGE_BACKEND should be mysql.")
    if not database_url:
        return fail("DATABASE_URL", "DATABASE_URL is required when using MySQL.")
    return ok("Persistence", "MySQL configured")


def check_mysql_connection(mysql_enabled: bool, *, production: bool) -> CheckResult:
    if not mysql_enabled:
        return fail_or_warn(production, "MySQL", "MySQL is not enabled by current settings.")
    try:
        mysql_store.ping()
    except Exception as exc:
        return fail_or_warn(production, "MySQL", f"connection failed: {exc.__class__.__name__}")
    return ok("MySQL", "connection ok")


def check_cors(cors_origins: list[str], *, production: bool) -> CheckResult:
    if not cors_origins:
        return fail("CITY_ROUTE_CORS_ORIGINS", "at least one allowed frontend origin is required.")
    if production and any(marker in origin for origin in cors_origins for marker in LOCAL_ORIGIN_MARKERS):
        return fail("CITY_ROUTE_CORS_ORIGINS", "production CORS origins must not use localhost or 127.0.0.1.")
    return ok("CITY_ROUTE_CORS_ORIGINS", f"{len(cors_origins)} origin(s)")


def check_amap(use_amap: bool, amap_api_key: str, *, production: bool) -> CheckResult:
    if not use_amap:
        return fail_or_warn(production, "AMAP_API_KEY", "Amap is disabled.")
    if not amap_api_key:
        return fail_or_warn(production, "AMAP_API_KEY", "Amap Web service key is missing.")
    return ok("AMAP_API_KEY", "configured")


def check_deepseek(use_deepseek: bool, deepseek_api_key: str, *, production: bool) -> CheckResult:
    if not use_deepseek:
        return warn("DEEPSEEK_API_KEY", "DeepSeek is disabled; local fallback will be used.")
    if not deepseek_api_key:
        return warn("DEEPSEEK_API_KEY", "missing; local route explanation fallback will be used.")
    return ok("DEEPSEEK_API_KEY", "configured")


def ok(name: str, detail: str) -> CheckResult:
    return CheckResult(status="ok", name=name, detail=detail)


def warn(name: str, detail: str) -> CheckResult:
    return CheckResult(status="warn", name=name, detail=detail)


def fail(name: str, detail: str) -> CheckResult:
    return CheckResult(status="fail", name=name, detail=detail)


def fail_or_warn(production: bool, name: str, detail: str) -> CheckResult:
    return fail(name, detail) if production else warn(name, detail)


if __name__ == "__main__":
    raise SystemExit(main())

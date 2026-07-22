import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Callable, TypeVar

from app.core.config import get_settings
from app.schemas.auth import UserRecord
from app.schemas.route import RoutePlan
from app.schemas.trip import CreateTripRequest, TripRecord, TripSummary

T = TypeVar("T")
DEFAULT_CLIENT_ID = "anonymous"
_MYSQL_UNAVAILABLE = object()

TRIPS: dict[int, TripRecord] = {}
PLANS: dict[int, RoutePlan] = {}
USERS: dict[int, UserRecord] = {}
_next_trip_id = 1000
_next_plan_id = 5000
_next_user_id = 100
_loaded = False
_lock = RLock()
_mysql_fallback_reason: str | None = None


def reset_store() -> None:
    if not mysql_enabled():
        clear_mysql_fallback()
    value = call_mysql(lambda: mysql_store().reset_store())
    if value is not _MYSQL_UNAVAILABLE:
        return

    global _next_trip_id, _next_plan_id, _next_user_id, _loaded
    with _lock:
        TRIPS.clear()
        PLANS.clear()
        USERS.clear()
        _next_trip_id = 1000
        _next_plan_id = 5000
        _next_user_id = 100
        _loaded = True


def reload_store() -> None:
    if not mysql_enabled():
        clear_mysql_fallback()
    value = call_mysql(lambda: mysql_store().reload_store())
    if value is not _MYSQL_UNAVAILABLE:
        return

    global _next_trip_id, _next_plan_id, _next_user_id, _loaded
    with _lock:
        TRIPS.clear()
        PLANS.clear()
        USERS.clear()
        _next_trip_id = 1000
        _next_plan_id = 5000
        _next_user_id = 100
        _loaded = False
        ensure_loaded()


def create_trip(payload: CreateTripRequest, client_id: str = DEFAULT_CLIENT_ID) -> TripRecord:
    value = call_mysql(lambda: mysql_store().create_trip(payload, client_id=client_id))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    global _next_trip_id
    with _lock:
        ensure_loaded()
        _next_trip_id += 1
        trip = TripRecord(id=_next_trip_id, client_id=client_id, **payload.model_dump())
        TRIPS[trip.id] = trip
        persist()
        return trip


def create_user(email: str, password_hash: str) -> UserRecord:
    value = call_mysql(lambda: mysql_store().create_user(email, password_hash))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    global _next_user_id
    with _lock:
        ensure_loaded()
        if any(user.email == email for user in USERS.values()):
            raise ValueError("Email already registered.")
        _next_user_id += 1
        user = UserRecord(
            id=_next_user_id,
            email=email,
            password_hash=password_hash,
            created_at=datetime.now(timezone.utc),
        )
        USERS[user.id] = user
        persist()
        return user


def get_user_by_email(email: str) -> UserRecord | None:
    value = call_mysql(lambda: mysql_store().get_user_by_email(email))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        return next((user for user in USERS.values() if user.email == email), None)


def get_user_by_id(user_id: int) -> UserRecord | None:
    value = call_mysql(lambda: mysql_store().get_user_by_id(user_id))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        return USERS.get(user_id)


def claim_client_trips(source_client_id: str, target_client_id: str) -> int:
    if source_client_id == target_client_id:
        return 0

    value = call_mysql(lambda: mysql_store().claim_client_trips(source_client_id, target_client_id))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        moved = 0
        for trip in TRIPS.values():
            if trip.client_id == source_client_id:
                trip.client_id = target_client_id
                moved += 1
        if moved:
            persist()
        return moved


def get_trip(trip_id: int, client_id: str = DEFAULT_CLIENT_ID) -> TripRecord | None:
    value = call_mysql(lambda: mysql_store().get_trip(trip_id, client_id=client_id))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        trip = TRIPS.get(trip_id)
        if not trip or trip.client_id != client_id:
            return None
        return trip


def delete_trip(trip_id: int, client_id: str = DEFAULT_CLIENT_ID) -> bool:
    value = call_mysql(lambda: mysql_store().delete_trip(trip_id, client_id=client_id))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        trip = TRIPS.get(trip_id)
        if not trip or trip.client_id != client_id:
            return False
        del TRIPS[trip_id]
        for plan_id in [plan.plan_id for plan in PLANS.values() if plan.trip_id == trip_id]:
            del PLANS[plan_id]
        persist()
        return True


def list_trip_summaries(limit: int = 10, client_id: str = DEFAULT_CLIENT_ID) -> list[TripSummary]:
    value = call_mysql(lambda: mysql_store().list_trip_summaries(limit=limit, client_id=client_id))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        sorted_trips = sorted(
            [trip for trip in TRIPS.values() if trip.client_id == client_id],
            key=lambda trip: trip.id,
            reverse=True,
        )[:limit]
        return [
            TripSummary(
                trip_id=trip.id,
                client_id=trip.client_id,
                city=trip.city,
                start_location_name=trip.start_location.name,
                start_time=trip.start_time,
                end_time=trip.end_time,
                traveler_style=trip.traveler_style,
                destination_names=[destination.name for destination in trip.destinations],
                status=trip.status,
                plan_count=sum(1 for plan in PLANS.values() if plan.trip_id == trip.id),
            )
            for trip in sorted_trips
        ]


def count_trips(client_id: str = DEFAULT_CLIENT_ID) -> int:
    value = call_mysql(lambda: mysql_store().count_trips(client_id=client_id))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        return sum(1 for trip in TRIPS.values() if trip.client_id == client_id)


def next_plan_id() -> int:
    value = call_mysql(lambda: mysql_store().next_plan_id())
    if value is not _MYSQL_UNAVAILABLE:
        return value

    global _next_plan_id
    with _lock:
        ensure_loaded()
        _next_plan_id += 1
        persist()
        return _next_plan_id


def save_plan(plan: RoutePlan) -> RoutePlan:
    value = call_mysql(lambda: mysql_store().save_plan(plan))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        PLANS[plan.plan_id] = plan
        persist()
        return plan


def get_plan(plan_id: int, client_id: str = DEFAULT_CLIENT_ID) -> RoutePlan | None:
    value = call_mysql(lambda: mysql_store().get_plan(plan_id))
    if value is not _MYSQL_UNAVAILABLE:
        if not value or value.trip_id is None:
            return value
        return value if get_trip(value.trip_id, client_id=client_id) else None

    with _lock:
        ensure_loaded()
        plan = PLANS.get(plan_id)
        if not plan or plan.trip_id is None:
            return plan
        trip = TRIPS.get(plan.trip_id)
        if not trip or trip.client_id != client_id:
            return None
        return plan


def list_plans_for_trip(trip_id: int, client_id: str = DEFAULT_CLIENT_ID) -> list[RoutePlan]:
    value = call_mysql(lambda: mysql_store().list_plans_for_trip(trip_id, client_id=client_id))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        trip = TRIPS.get(trip_id)
        if not trip or trip.client_id != client_id:
            return []
        return sorted(
            [plan for plan in PLANS.values() if plan.trip_id == trip_id],
            key=lambda plan: plan.plan_id,
        )


def set_trip_share_token(trip_id: int, client_id: str, share_token: str) -> TripRecord | None:
    value = call_mysql(lambda: mysql_store().set_trip_share_token(trip_id, client_id, share_token))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        trip = TRIPS.get(trip_id)
        if not trip or trip.client_id != client_id:
            return None
        trip.share_token = share_token
        persist()
        return trip


def get_trip_by_share_token(share_token: str) -> TripRecord | None:
    value = call_mysql(lambda: mysql_store().get_trip_by_share_token(share_token))
    if value is not _MYSQL_UNAVAILABLE:
        return value

    with _lock:
        ensure_loaded()
        return next((trip for trip in TRIPS.values() if trip.share_token == share_token), None)


def ensure_loaded() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    if not persistence_enabled():
        return

    path = store_path()
    if not path.exists():
        return

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return

    TRIPS.clear()
    PLANS.clear()
    USERS.clear()
    for raw_trip in data.get("trips", []):
        trip = TripRecord.model_validate(raw_trip)
        TRIPS[trip.id] = trip
    for raw_plan in data.get("plans", []):
        plan = RoutePlan.model_validate(raw_plan)
        PLANS[plan.plan_id] = plan
    for raw_user in data.get("users", []):
        user = UserRecord.model_validate(raw_user)
        USERS[user.id] = user

    global _next_trip_id, _next_plan_id, _next_user_id
    _next_trip_id = max([1000, *TRIPS.keys(), int(data.get("nextTripId", 1000))])
    _next_plan_id = max([5000, *PLANS.keys(), int(data.get("nextPlanId", 5000))])
    _next_user_id = max([100, *USERS.keys(), int(data.get("nextUserId", 100))])


def persist() -> None:
    if not persistence_enabled():
        return

    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "nextTripId": _next_trip_id,
        "nextPlanId": _next_plan_id,
        "nextUserId": _next_user_id,
        "trips": [trip.model_dump(mode="json", by_alias=True) for trip in TRIPS.values()],
        "plans": [plan.model_dump(mode="json", by_alias=True) for plan in PLANS.values()],
        "users": [user.model_dump(mode="json", by_alias=True) for user in USERS.values()],
    }
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def persistence_enabled() -> bool:
    return get_settings().persistence_enabled


def store_path() -> Path:
    return Path(get_settings().storage_path)


def mysql_enabled() -> bool:
    return get_settings().mysql_enabled


def mysql_store():
    from app.storage import mysql_store as store

    return store


def call_mysql(operation: Callable[[], T]) -> T | object:
    settings = get_settings()
    if not mysql_enabled():
        if settings.app_env == "production" and settings.persistence_enabled:
            raise RuntimeError("MySQL persistence is required in production.")
        return _MYSQL_UNAVAILABLE
    if _mysql_fallback_reason:
        if settings.app_env == "production":
            raise RuntimeError("MySQL persistence is unavailable in production.")
        return _MYSQL_UNAVAILABLE
    try:
        return operation()
    except Exception as exc:
        if settings.app_env == "production":
            raise RuntimeError("MySQL operation failed in production.") from exc
        enable_json_fallback(exc)
        return _MYSQL_UNAVAILABLE


def enable_json_fallback(exc: Exception) -> None:
    global _mysql_fallback_reason
    _mysql_fallback_reason = f"{exc.__class__.__name__}: {str(exc)[:160]}"


def clear_mysql_fallback() -> None:
    global _mysql_fallback_reason
    _mysql_fallback_reason = None


def storage_status() -> dict[str, str]:
    settings = get_settings()
    if not settings.persistence_enabled:
        return {
            "backend": "memory",
            "status": "error" if settings.app_env == "production" else "disabled",
            "detail": "生产环境必须启用 MySQL 持久化。" if settings.app_env == "production" else "当前环境未启用持久化。",
        }

    if not settings.mysql_enabled:
        return {
            "backend": "mysql" if settings.app_env == "production" else "json",
            "status": "error" if settings.app_env == "production" else "ready",
            "detail": "生产环境必须正确配置 MySQL。" if settings.app_env == "production" else "已启用 JSON 本地持久化。",
        }

    try:
        value = call_mysql(lambda: mysql_store().ping())
    except RuntimeError:
        return {
            "backend": "mysql",
            "status": "error",
            "detail": "MySQL 当前不可用，生产服务已停止写入并等待恢复。",
        }
    if value is not _MYSQL_UNAVAILABLE:
        return {
            "backend": "mysql",
            "status": "ready",
            "detail": "已启用 MySQL 持久化。",
        }

    return {
        "backend": "json",
        "status": "ready",
        "detail": "MySQL 暂不可用，当前已自动降级为 JSON 本地持久化。请确认 MySQL 服务启动后重启后端以重新优先使用 MySQL。",
    }

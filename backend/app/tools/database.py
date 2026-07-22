from __future__ import annotations

import argparse
import json
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.schemas.route import RouteLeg, RoutePlan, RouteStop
from app.schemas.auth import UserRecord
from app.schemas.trip import CreateTripRequest, Location, TripDestination, TripRecord
from app.storage import mysql_store


def main() -> int:
    parser = argparse.ArgumentParser(description="City Route database helper")
    parser.add_argument(
        "action",
        choices=("status", "init", "migrate-json", "backup", "restore", "verify"),
        nargs="?",
        default="status",
        help="Database action to run.",
    )
    parser.add_argument("--file", help="Backup file for restore.")
    parser.add_argument("--output-dir", help="Output directory for backup files.")
    args = parser.parse_args()

    if args.action == "status":
        return status()
    if args.action == "init":
        return init_schema()
    if args.action == "migrate-json":
        return migrate_json()
    if args.action == "backup":
        return backup_mysql(args.output_dir)
    if args.action == "restore":
        return restore_mysql(args.file)
    if args.action == "verify":
        return verify_mysql()
    raise AssertionError(f"Unsupported action: {args.action}")


def status() -> int:
    settings = get_settings()
    json_path = Path(settings.storage_path)

    print("Database status")
    print(f"- App env: {settings.app_env}")
    print(f"- Persistence enabled: {yes_no(settings.persistence_enabled)}")
    print(f"- Requested backend: {settings.storage_backend or 'json'}")
    print(f"- MySQL configured: {yes_no(settings.mysql_enabled)}")
    print(f"- JSON store path: {json_path}")
    print(f"- JSON store exists: {yes_no(json_path.exists())}")

    if not settings.persistence_enabled:
        print("- Active storage: memory only")
        return 0

    if not settings.mysql_enabled:
        print("- Active storage: JSON")
        print("- To use MySQL: set CITY_ROUTE_STORAGE_BACKEND=mysql and DATABASE_URL in .env")
        return 0

    try:
        mysql_store.ping()
    except Exception as exc:
        print("- MySQL connection: failed")
        print(f"- Reason: {sanitize_error(exc)}")
        if settings.app_env == "production":
            print("- Active storage in app: unavailable; production does not fall back to JSON")
        else:
            print("- Active storage in app: JSON fallback until backend restarts with MySQL available")
        return 0

    print("- MySQL connection: ok")
    print("- Active storage: MySQL")
    return 0


def init_schema() -> int:
    require_mysql()
    try:
        mysql_store.ensure_schema()
        mysql_store.ping()
    except Exception as exc:
        print("MySQL schema init failed.")
        print(f"Reason: {sanitize_error(exc)}")
        return 1

    print("MySQL schema is ready.")
    return 0


def migrate_json() -> int:
    require_mysql()

    settings = get_settings()
    json_path = Path(settings.storage_path)
    if not json_path.exists():
        print(f"JSON store does not exist: {json_path}")
        return 1

    try:
        raw = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print("Failed to read JSON store.")
        print(f"Reason: {sanitize_error(exc)}")
        return 1

    try:
        trips = [TripRecord.model_validate(item) for item in raw.get("trips", [])]
        plans = [RoutePlan.model_validate(item) for item in raw.get("plans", [])]
        users = [UserRecord.model_validate(item) for item in raw.get("users", [])]
    except Exception as exc:
        print("JSON store validation failed.")
        print(f"Reason: {sanitize_error(exc)}")
        return 1

    orphan_plans = [plan.plan_id for plan in plans if plan.trip_id is None]
    if orphan_plans:
        print("Migration stopped because some route plans do not belong to a trip.")
        print(f"Plan ids: {', '.join(str(plan_id) for plan_id in orphan_plans[:20])}")
        return 1

    try:
        mysql_store.ensure_schema()
        with mysql_store.connection() as conn:
            with conn.cursor() as cursor:
                for user in users:
                    cursor.execute(
                        """
                        REPLACE INTO users (id, email, password_hash, created_at)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            user.id,
                            user.email,
                            user.password_hash,
                            mysql_datetime(user.created_at),
                        ),
                    )

                for trip in trips:
                    cursor.execute(
                        """
                        REPLACE INTO trips
                          (id, client_id, city, start_location_name, start_time, end_time, status, share_token, payload_json)
                        VALUES
                          (%s, %s, %s, %s, %s, %s, %s, %s, CAST(%s AS JSON))
                        """,
                        (
                            trip.id,
                            trip.client_id,
                            trip.city,
                            trip.start_location.name,
                            mysql_datetime(trip.start_time),
                            mysql_datetime(trip.end_time),
                            trip.status,
                            trip.share_token,
                            mysql_store.model_json(trip),
                        ),
                    )

                for plan in plans:
                    cursor.execute(
                        """
                        REPLACE INTO route_plans (plan_id, trip_id, title, style, payload_json)
                        VALUES (%s, %s, %s, %s, CAST(%s AS JSON))
                        """,
                        (
                            plan.plan_id,
                            plan.trip_id,
                            plan.title,
                            plan.style,
                            mysql_store.model_json(plan),
                        ),
                    )

                cursor.execute(
                    "REPLACE INTO app_meta (name, value) VALUES (%s, %s)",
                    ("next_trip_id", next_counter_value(raw, "nextTripId", [trip.id for trip in trips], 1000)),
                )
                cursor.execute(
                    "REPLACE INTO app_meta (name, value) VALUES (%s, %s)",
                    ("next_plan_id", next_counter_value(raw, "nextPlanId", [plan.plan_id for plan in plans], 5000)),
                )
                cursor.execute(
                    "REPLACE INTO app_meta (name, value) VALUES (%s, %s)",
                    ("next_user_id", next_counter_value(raw, "nextUserId", [user.id for user in users], 100)),
                )
            conn.commit()
    except Exception as exc:
        print("Migration failed.")
        print(f"Reason: {sanitize_error(exc)}")
        return 1

    print("JSON data migrated to MySQL.")
    print(f"- Users: {len(users)}")
    print(f"- Trips: {len(trips)}")
    print(f"- Route plans: {len(plans)}")
    return 0


def backup_mysql(output_dir: str | None = None) -> int:
    require_mysql()

    try:
        mysql_store.ensure_schema()
        payload = read_mysql_payload()
    except Exception as exc:
        print("MySQL backup failed.")
        print(f"Reason: {sanitize_error(exc)}")
        return 1

    backup_dir = Path(output_dir) if output_dir else project_root() / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    filename = "city-route-mysql-{}.json".format(datetime.now().strftime("%Y%m%d-%H%M%S"))
    backup_path = backup_dir / filename
    backup_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print("MySQL backup completed.")
    print(f"- File: {backup_path}")
    print(f"- Users: {len(payload['users'])}")
    print(f"- Trips: {len(payload['trips'])}")
    print(f"- Route plans: {len(payload['plans'])}")
    return 0


def restore_mysql(file_path: str | None) -> int:
    require_mysql()
    if not file_path:
        print("Restore requires --file.")
        return 1

    path = Path(file_path)
    if not path.exists():
        print(f"Backup file does not exist: {path}")
        return 1

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        users = [UserRecord.model_validate(item) for item in payload.get("users", [])]
        trips = [TripRecord.model_validate(item) for item in payload.get("trips", [])]
        plans = [RoutePlan.model_validate(item) for item in payload.get("plans", [])]
        meta = payload.get("meta", {})
        write_mysql_payload(users=users, trips=trips, plans=plans, meta=meta)
    except Exception as exc:
        print("MySQL restore failed.")
        print(f"Reason: {sanitize_error(exc)}")
        return 1

    print("MySQL restore completed.")
    print(f"- Users: {len(users)}")
    print(f"- Trips: {len(trips)}")
    print(f"- Route plans: {len(plans)}")
    return 0


def verify_mysql() -> int:
    require_mysql()

    client_id = "db-verify"
    trip_id: int | None = None
    try:
        mysql_store.ensure_schema()
        mysql_store.ping()
        before = read_counts()

        payload = sample_trip_payload()
        trip = mysql_store.create_trip(payload, client_id=client_id)
        trip_id = trip.id

        plan = sample_route_plan(trip_id=trip.id, plan_id=mysql_store.next_plan_id())
        mysql_store.save_plan(plan)

        share_token = "verify-" + secrets.token_urlsafe(12)
        shared_trip = mysql_store.set_trip_share_token(trip.id, client_id, share_token)
        if shared_trip is None or shared_trip.share_token != share_token:
            raise RuntimeError("Failed to persist share token.")

        if mysql_store.get_trip(trip.id, client_id=client_id) is None:
            raise RuntimeError("Created trip cannot be read back.")
        if mysql_store.get_plan(plan.plan_id) is None:
            raise RuntimeError("Created route plan cannot be read back.")
        if mysql_store.get_trip_by_share_token(share_token) is None:
            raise RuntimeError("Shared trip cannot be read back by token.")

        if not mysql_store.delete_trip(trip.id, client_id=client_id):
            raise RuntimeError("Failed to delete verification trip.")
        trip_id = None

        after = read_counts()
        if before["trips"] != after["trips"] or before["plans"] != after["plans"]:
            raise RuntimeError(f"Verification cleanup mismatch: before={before}, after={after}")
    except Exception as exc:
        if trip_id is not None:
            try:
                mysql_store.delete_trip(trip_id, client_id=client_id)
            except Exception:
                pass
        print("MySQL verification failed.")
        print(f"Reason: {sanitize_error(exc)}")
        return 1

    print("MySQL verification completed.")
    print("- Connection: ok")
    print("- Schema: ok")
    print("- Trip create/read/delete: ok")
    print("- Route plan save/read: ok")
    print("- Share token save/read: ok")
    return 0


def read_mysql_payload() -> dict[str, Any]:
    with mysql_store.connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT name, value FROM app_meta")
            meta = {row["name"]: int(row["value"]) for row in cursor.fetchall()}
            cursor.execute("SELECT payload_json FROM trips ORDER BY id")
            trips = [TripRecord.model_validate(mysql_store.load_json(row["payload_json"])) for row in cursor.fetchall()]
            cursor.execute("SELECT payload_json FROM route_plans ORDER BY plan_id")
            plans = [RoutePlan.model_validate(mysql_store.load_json(row["payload_json"])) for row in cursor.fetchall()]
            cursor.execute("SELECT id, email, password_hash, created_at FROM users ORDER BY id")
            users = [mysql_store.row_to_user(row) for row in cursor.fetchall()]

    return {
        "schemaVersion": 1,
        "createdAt": datetime.now().isoformat(),
        "source": "mysql",
        "meta": meta,
        "users": [user.model_dump(mode="json", by_alias=True) for user in users],
        "trips": [trip.model_dump(mode="json", by_alias=True) for trip in trips],
        "plans": [plan.model_dump(mode="json", by_alias=True) for plan in plans],
    }


def write_mysql_payload(
    *,
    users: list[UserRecord],
    trips: list[TripRecord],
    plans: list[RoutePlan],
    meta: dict[str, Any],
) -> None:
    raw = {
        "nextTripId": meta.get("next_trip_id", 1000),
        "nextPlanId": meta.get("next_plan_id", 5000),
        "nextUserId": meta.get("next_user_id", 100),
    }
    write_records(users=users, trips=trips, plans=plans, raw=raw)


def write_records(
    *,
    users: list[UserRecord],
    trips: list[TripRecord],
    plans: list[RoutePlan],
    raw: dict[str, Any],
) -> None:
    orphan_plans = [plan.plan_id for plan in plans if plan.trip_id is None]
    if orphan_plans:
        raise RuntimeError("Some route plans do not belong to a trip.")

    mysql_store.ensure_schema()
    with mysql_store.connection() as conn:
        with conn.cursor() as cursor:
            for user in users:
                cursor.execute(
                    """
                    REPLACE INTO users (id, email, password_hash, created_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user.id, user.email, user.password_hash, mysql_datetime(user.created_at)),
                )

            for trip in trips:
                cursor.execute(
                    """
                    REPLACE INTO trips
                      (id, client_id, city, start_location_name, start_time, end_time, status, share_token, payload_json)
                    VALUES
                      (%s, %s, %s, %s, %s, %s, %s, %s, CAST(%s AS JSON))
                    """,
                    (
                        trip.id,
                        trip.client_id,
                        trip.city,
                        trip.start_location.name,
                        mysql_datetime(trip.start_time),
                        mysql_datetime(trip.end_time),
                        trip.status,
                        trip.share_token,
                        mysql_store.model_json(trip),
                    ),
                )

            for plan in plans:
                cursor.execute(
                    """
                    REPLACE INTO route_plans (plan_id, trip_id, title, style, payload_json)
                    VALUES (%s, %s, %s, %s, CAST(%s AS JSON))
                    """,
                    (plan.plan_id, plan.trip_id, plan.title, plan.style, mysql_store.model_json(plan)),
                )

            cursor.execute(
                "REPLACE INTO app_meta (name, value) VALUES (%s, %s)",
                ("next_trip_id", next_counter_value(raw, "nextTripId", [trip.id for trip in trips], 1000)),
            )
            cursor.execute(
                "REPLACE INTO app_meta (name, value) VALUES (%s, %s)",
                ("next_plan_id", next_counter_value(raw, "nextPlanId", [plan.plan_id for plan in plans], 5000)),
            )
            cursor.execute(
                "REPLACE INTO app_meta (name, value) VALUES (%s, %s)",
                ("next_user_id", next_counter_value(raw, "nextUserId", [user.id for user in users], 100)),
            )
        conn.commit()


def read_counts() -> dict[str, int]:
    with mysql_store.connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM users")
            users = int(cursor.fetchone()["total"])
            cursor.execute("SELECT COUNT(*) AS total FROM trips")
            trips = int(cursor.fetchone()["total"])
            cursor.execute("SELECT COUNT(*) AS total FROM route_plans")
            plans = int(cursor.fetchone()["total"])
    return {"users": users, "trips": trips, "plans": plans}


def sample_trip_payload() -> CreateTripRequest:
    start_time = datetime(2026, 7, 8, 9, 0, 0)
    end_time = datetime(2026, 7, 8, 12, 0, 0)
    return CreateTripRequest(
        city="DB Verify",
        start_location=Location(name="Start", lat=31.2304, lng=121.4737),
        start_time=start_time,
        end_time=end_time,
        transport_preference="metro",
        pace="balanced",
        traveler_style="classic",
        destinations=[
            sample_destination("verify-poi-1", 31.231, 121.474),
            sample_destination("verify-poi-2", 31.232, 121.475),
        ],
    )


def sample_destination(source_poi_id: str, lat: float, lng: float) -> TripDestination:
    return TripDestination(
        source="verify",
        source_poi_id=source_poi_id,
        raw_name=source_poi_id,
        name=source_poi_id,
        address="verify address",
        lat=lat,
        lng=lng,
        poi_type="landmark",
        must_go=False,
        stay_minutes=None,
        suggested_stay_minutes=45,
        risk_level="low",
        tags=["verify"],
        note="database verification",
    )


def sample_route_plan(trip_id: int, plan_id: int) -> RoutePlan:
    arrival = datetime(2026, 7, 8, 9, 30, 0)
    departure = datetime(2026, 7, 8, 10, 15, 0)
    return RoutePlan(
        plan_id=plan_id,
        trip_id=trip_id,
        title="DB verification plan",
        style="verification",
        total_minutes=75,
        travel_minutes=30,
        visit_minutes=45,
        walking_level="low",
        risk_level="low",
        score=9.0,
        estimated_end_time=datetime(2026, 7, 8, 10, 45, 0),
        summary="Database verification route plan.",
        stops=[
            RouteStop(
                destination_id="verify-poi-1",
                name="verify-poi-1",
                arrival_time=arrival,
                departure_time=departure,
                stay_minutes=45,
                suggestion="Verify database persistence.",
                risk_level="low",
                tags=["verify"],
            )
        ],
        legs=[
            RouteLeg(
                from_name="Start",
                to_name="verify-poi-1",
                transport_mode="metro",
                duration_minutes=30,
                distance_meters=1200,
                navigation_url="",
                source="verify",
            )
        ],
    )


def require_mysql() -> None:
    settings = get_settings()
    if not settings.mysql_enabled:
        raise SystemExit(
            "MySQL is not configured. Set CITY_ROUTE_STORAGE_BACKEND=mysql and DATABASE_URL in .env first."
        )


def project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def mysql_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.replace(tzinfo=None)


def next_counter_value(raw: dict[str, Any], key: str, ids: list[int], base: int) -> int:
    raw_value = raw.get(key, base)
    try:
        stored_value = int(raw_value)
    except (TypeError, ValueError):
        stored_value = base
    return max([base, stored_value, *ids])


def yes_no(value: bool) -> str:
    return "yes" if value else "no"


def sanitize_error(exc: Exception) -> str:
    message = str(exc).replace("\n", " ").strip()
    if len(message) > 180:
        message = message[:177] + "..."
    return f"{exc.__class__.__name__}: {message}"


if __name__ == "__main__":
    raise SystemExit(main())

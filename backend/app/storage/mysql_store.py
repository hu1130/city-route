import json
from contextlib import contextmanager
from datetime import datetime, timezone
from urllib.parse import unquote, urlparse

import pymysql
from pymysql.err import IntegrityError
from pymysql.connections import Connection
from pymysql.cursors import DictCursor

from app.core.config import get_settings
from app.schemas.auth import UserRecord
from app.schemas.route import RoutePlan
from app.schemas.trip import CreateTripRequest, TripRecord, TripSummary

DEFAULT_CLIENT_ID = "anonymous"

SCHEMA_SQL = [
    """
    CREATE TABLE IF NOT EXISTS app_meta (
      name VARCHAR(64) PRIMARY KEY,
      value BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(512) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS trips (
      id BIGINT PRIMARY KEY,
      client_id VARCHAR(128) NOT NULL DEFAULT 'anonymous',
      city VARCHAR(128) NOT NULL,
      start_location_name VARCHAR(255) NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      status VARCHAR(32) NOT NULL,
      share_token VARCHAR(80) NULL,
      payload_json JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_trips_client_id (client_id),
      UNIQUE KEY uq_trips_share_token (share_token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS route_plans (
      plan_id BIGINT PRIMARY KEY,
      trip_id BIGINT NOT NULL,
      title VARCHAR(128) NOT NULL,
      style VARCHAR(64) NOT NULL,
      payload_json JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_route_plans_trip_id (trip_id),
      CONSTRAINT fk_route_plans_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    """,
]

_initialized = False


def create_trip(payload: CreateTripRequest, client_id: str = DEFAULT_CLIENT_ID) -> TripRecord:
    ensure_schema()
    with connection() as conn:
        trip_id = next_counter(conn, "next_trip_id", 1000)
        trip = TripRecord(id=trip_id, client_id=client_id, **payload.model_dump())
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO trips (id, client_id, city, start_location_name, start_time, end_time, status, payload_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, CAST(%s AS JSON))
                """,
                (
                    trip.id,
                    trip.client_id,
                    trip.city,
                    trip.start_location.name,
                    trip.start_time.replace(tzinfo=None),
                    trip.end_time.replace(tzinfo=None),
                    trip.status,
                    model_json(trip),
                ),
            )
        conn.commit()
        return trip


def create_user(email: str, password_hash: str) -> UserRecord:
    ensure_schema()
    with connection() as conn:
        user_id = next_counter(conn, "next_user_id", 100)
        created_at = datetime.now(timezone.utc)
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO users (id, email, password_hash, created_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, email, password_hash, created_at.replace(tzinfo=None)),
                )
            conn.commit()
        except IntegrityError as exc:
            conn.rollback()
            raise ValueError("Email already registered.") from exc
    return UserRecord(id=user_id, email=email, password_hash=password_hash, created_at=created_at)


def get_user_by_email(email: str) -> UserRecord | None:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, email, password_hash, created_at FROM users WHERE email = %s", (email,))
            row = cursor.fetchone()
    return row_to_user(row) if row else None


def get_user_by_id(user_id: int) -> UserRecord | None:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, email, password_hash, created_at FROM users WHERE id = %s", (user_id,))
            row = cursor.fetchone()
    return row_to_user(row) if row else None


def claim_client_trips(source_client_id: str, target_client_id: str) -> int:
    if source_client_id == target_client_id:
        return 0

    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, payload_json FROM trips WHERE client_id = %s", (source_client_id,))
            rows = cursor.fetchall()
            for row in rows:
                trip = TripRecord.model_validate(load_json(row["payload_json"]))
                trip.client_id = target_client_id
                cursor.execute(
                    "UPDATE trips SET client_id = %s, payload_json = CAST(%s AS JSON) WHERE id = %s",
                    (target_client_id, model_json(trip), trip.id),
                )
        conn.commit()
    return len(rows)


def get_trip(trip_id: int, client_id: str = DEFAULT_CLIENT_ID) -> TripRecord | None:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT payload_json FROM trips WHERE id = %s AND client_id = %s", (trip_id, client_id))
            row = cursor.fetchone()
    return TripRecord.model_validate(load_json(row["payload_json"])) if row else None


def delete_trip(trip_id: int, client_id: str = DEFAULT_CLIENT_ID) -> bool:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM trips WHERE id = %s AND client_id = %s", (trip_id, client_id))
            deleted = cursor.rowcount > 0
        conn.commit()
    return deleted


def list_trip_summaries(limit: int = 10, client_id: str = DEFAULT_CLIENT_ID) -> list[TripSummary]:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT t.payload_json, COUNT(p.plan_id) AS plan_count
                FROM trips t
                LEFT JOIN route_plans p ON p.trip_id = t.id
                WHERE t.client_id = %s
                GROUP BY t.id
                ORDER BY t.id DESC
                LIMIT %s
                """,
                (client_id, limit),
            )
            rows = cursor.fetchall()

    summaries: list[TripSummary] = []
    for row in rows:
        trip = TripRecord.model_validate(load_json(row["payload_json"]))
        summaries.append(
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
                plan_count=int(row["plan_count"] or 0),
            )
        )
    return summaries


def count_trips(client_id: str = DEFAULT_CLIENT_ID) -> int:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM trips WHERE client_id = %s", (client_id,))
            row = cursor.fetchone()
    return int(row["total"] if row else 0)


def next_plan_id() -> int:
    ensure_schema()
    with connection() as conn:
        value = next_counter(conn, "next_plan_id", 5000)
        conn.commit()
        return value


def save_plan(plan: RoutePlan) -> RoutePlan:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                REPLACE INTO route_plans (plan_id, trip_id, title, style, payload_json)
                VALUES (%s, %s, %s, %s, CAST(%s AS JSON))
                """,
                (plan.plan_id, plan.trip_id, plan.title, plan.style, model_json(plan)),
            )
        conn.commit()
    return plan


def get_plan(plan_id: int) -> RoutePlan | None:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT payload_json FROM route_plans WHERE plan_id = %s", (plan_id,))
            row = cursor.fetchone()
    return RoutePlan.model_validate(load_json(row["payload_json"])) if row else None


def list_plans_for_trip(trip_id: int, client_id: str = DEFAULT_CLIENT_ID) -> list[RoutePlan]:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT p.payload_json
                FROM route_plans p
                JOIN trips t ON t.id = p.trip_id
                WHERE p.trip_id = %s AND t.client_id = %s
                ORDER BY p.plan_id
                """,
                (trip_id, client_id),
            )
            rows = cursor.fetchall()
    return [RoutePlan.model_validate(load_json(row["payload_json"])) for row in rows]


def set_trip_share_token(trip_id: int, client_id: str, share_token: str) -> TripRecord | None:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT payload_json FROM trips WHERE id = %s AND client_id = %s", (trip_id, client_id))
            row = cursor.fetchone()
            if not row:
                return None
            trip = TripRecord.model_validate(load_json(row["payload_json"]))
            trip.share_token = share_token
            cursor.execute(
                """
                UPDATE trips
                SET share_token = %s, payload_json = CAST(%s AS JSON)
                WHERE id = %s AND client_id = %s
                """,
                (share_token, model_json(trip), trip_id, client_id),
            )
        conn.commit()
    return trip


def get_trip_by_share_token(share_token: str) -> TripRecord | None:
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT payload_json FROM trips WHERE share_token = %s", (share_token,))
            row = cursor.fetchone()
    return TripRecord.model_validate(load_json(row["payload_json"])) if row else None


def reset_store() -> None:
    global _initialized
    ensure_schema()
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM route_plans")
            cursor.execute("DELETE FROM trips")
            cursor.execute("DELETE FROM users")
            cursor.execute("REPLACE INTO app_meta (name, value) VALUES ('next_trip_id', 1000)")
            cursor.execute("REPLACE INTO app_meta (name, value) VALUES ('next_plan_id', 5000)")
            cursor.execute("REPLACE INTO app_meta (name, value) VALUES ('next_user_id', 100)")
        conn.commit()
    _initialized = False


def reload_store() -> None:
    global _initialized
    _initialized = False
    ensure_schema()


def ensure_schema() -> None:
    global _initialized
    if _initialized:
        return
    with connection() as conn:
        with conn.cursor() as cursor:
            for statement in SCHEMA_SQL:
                cursor.execute(statement)
            ensure_client_id_column(cursor)
            ensure_share_token_column(cursor)
            cursor.execute("INSERT IGNORE INTO app_meta (name, value) VALUES ('next_trip_id', 1000)")
            cursor.execute("INSERT IGNORE INTO app_meta (name, value) VALUES ('next_plan_id', 5000)")
            cursor.execute("INSERT IGNORE INTO app_meta (name, value) VALUES ('next_user_id', 100)")
        conn.commit()
    _initialized = True


def ensure_client_id_column(cursor) -> None:
    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'trips'
          AND COLUMN_NAME = 'client_id'
        """
    )
    row = cursor.fetchone()
    if int(row["total"] if row else 0) == 0:
        cursor.execute("ALTER TABLE trips ADD COLUMN client_id VARCHAR(128) NOT NULL DEFAULT 'anonymous' AFTER id")
        cursor.execute("ALTER TABLE trips ADD INDEX idx_trips_client_id (client_id)")


def ensure_share_token_column(cursor) -> None:
    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'trips'
          AND COLUMN_NAME = 'share_token'
        """
    )
    row = cursor.fetchone()
    if int(row["total"] if row else 0) == 0:
        cursor.execute("ALTER TABLE trips ADD COLUMN share_token VARCHAR(80) NULL AFTER status")
        cursor.execute("ALTER TABLE trips ADD UNIQUE KEY uq_trips_share_token (share_token)")


def next_counter(conn: Connection, name: str, base: int) -> int:
    with conn.cursor() as cursor:
        cursor.execute("SELECT value FROM app_meta WHERE name = %s FOR UPDATE", (name,))
        row = cursor.fetchone()
        current = int(row["value"]) if row else base
        next_value = current + 1
        cursor.execute("REPLACE INTO app_meta (name, value) VALUES (%s, %s)", (name, next_value))
    return next_value


@contextmanager
def connection():
    conn = pymysql.connect(**connection_kwargs())
    try:
        yield conn
    finally:
        conn.close()


def connection_kwargs() -> dict:
    url = urlparse(get_settings().database_url)
    if url.scheme not in {"mysql", "mysql+pymysql"}:
        raise RuntimeError("DATABASE_URL must start with mysql+pymysql://")
    return {
        "host": url.hostname or "127.0.0.1",
        "port": url.port or 3306,
        "user": unquote(url.username or ""),
        "password": unquote(url.password or ""),
        "database": (url.path or "/city_route_mvp").lstrip("/"),
        "charset": "utf8mb4",
        "autocommit": False,
        "connect_timeout": 2,
        "read_timeout": 5,
        "write_timeout": 5,
        "cursorclass": DictCursor,
    }


def ping() -> None:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1")


def row_to_user(row: dict) -> UserRecord:
    created_at = row["created_at"]
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return UserRecord(
        id=int(row["id"]),
        email=row["email"],
        password_hash=row["password_hash"],
        created_at=created_at,
    )


def model_json(value) -> str:
    return json.dumps(value.model_dump(mode="json", by_alias=True), ensure_ascii=False, separators=(",", ":"))


def load_json(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    return json.loads(value)

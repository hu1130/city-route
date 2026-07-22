from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from dataclasses import dataclass

from app.core.config import get_settings
from app.schemas.auth import AuthUser, UserRecord

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_MIN_LENGTH = 6
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
PBKDF2_ITERATIONS = 210_000


@dataclass(frozen=True)
class TokenData:
    user_id: int
    email: str
    expires_at: int


def normalize_email(email: str) -> str:
    value = email.strip().lower()
    if not EMAIL_PATTERN.fullmatch(value):
        raise ValueError("Email format is invalid.")
    return value


def validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters.")


def hash_password(password: str) -> str:
    validate_password(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        encode_bytes(salt),
        encode_bytes(digest),
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, raw_iterations, raw_salt, raw_digest = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(raw_iterations)
        salt = decode_bytes(raw_salt)
        expected = decode_bytes(raw_digest)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(user: UserRecord | AuthUser) -> str:
    now = int(time.time())
    payload = {
        "sub": user.id,
        "email": user.email,
        "iat": now,
        "exp": now + token_ttl_seconds(),
    }
    encoded_payload = encode_json(payload)
    signature = sign(encoded_payload)
    return f"{encoded_payload}.{signature}"


def verify_access_token(token: str) -> TokenData:
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid auth token.") from exc

    if not hmac.compare_digest(sign(encoded_payload), signature):
        raise ValueError("Invalid auth token.")

    payload = decode_json(encoded_payload)
    expires_at = int(payload.get("exp", 0))
    if expires_at < int(time.time()):
        raise ValueError("Auth token expired.")

    return TokenData(user_id=int(payload["sub"]), email=str(payload["email"]), expires_at=expires_at)


def public_user(user: UserRecord) -> AuthUser:
    return AuthUser(id=user.id, email=user.email, created_at=user.created_at)


def sign(encoded_payload: str) -> str:
    digest = hmac.new(auth_secret().encode("utf-8"), encoded_payload.encode("utf-8"), hashlib.sha256).digest()
    return encode_bytes(digest)


def auth_secret() -> str:
    return get_settings().auth_secret


def token_ttl_seconds() -> int:
    value = get_settings().auth_token_ttl_seconds
    return value if value > 0 else TOKEN_TTL_SECONDS


def encode_json(value: dict) -> str:
    return encode_bytes(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def decode_json(value: str) -> dict:
    return json.loads(decode_bytes(value).decode("utf-8"))


def encode_bytes(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def decode_bytes(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))

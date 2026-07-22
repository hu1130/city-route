import re

from fastapi import HTTPException

from app.schemas.auth import UserRecord
from app.services.auth_service import verify_access_token
from app.storage.memory_store import get_user_by_id

CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{3,128}$")
DEFAULT_CLIENT_ID = "anonymous"


def user_client_id(user_id: int) -> str:
    return f"user:{user_id}"


def normalized_client_id(value: str | None) -> str:
    if value is None or not value.strip():
        return DEFAULT_CLIENT_ID
    client_id = value.strip()
    if not CLIENT_ID_PATTERN.fullmatch(client_id):
        raise HTTPException(status_code=400, detail="Invalid X-Client-Id header.")
    return client_id


def current_user_from_authorization(authorization: str | None) -> UserRecord | None:
    token = bearer_token(authorization)
    if token is None:
        return None

    try:
        token_data = verify_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired login.") from exc

    user = get_user_by_id(token_data.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired login.")
    return user


def require_current_user(authorization: str | None) -> UserRecord:
    user = current_user_from_authorization(authorization)
    if user is None:
        raise HTTPException(status_code=401, detail="Login required.")
    return user


def current_owner_id(authorization: str | None, client_id: str | None) -> str:
    user = current_user_from_authorization(authorization)
    if user is not None:
        return user_client_id(user.id)
    return normalized_client_id(client_id)


def bearer_token(authorization: str | None) -> str | None:
    if authorization is None or not authorization.strip():
        return None
    scheme, _, value = authorization.strip().partition(" ")
    if scheme.lower() != "bearer" or not value:
        raise HTTPException(status_code=401, detail="Invalid Authorization header.")
    return value.strip()

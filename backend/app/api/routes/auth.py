from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.api.identity import normalized_client_id, require_current_user, user_client_id
from app.schemas.auth import AuthCredentials, AuthResponse, AuthUser, ClaimGuestRequest, ClaimGuestResponse
from app.services.auth_service import (
    create_access_token,
    hash_password,
    normalize_email,
    public_user,
    validate_password,
    verify_password,
)
from app.services.login_rate_limiter import (
    LoginRateLimitExceeded,
    check_login_allowed,
    clear_login_failures,
    record_login_failure,
)
from app.storage.memory_store import claim_client_trips, create_user, get_user_by_email

router = APIRouter()


@router.post("/register", response_model=AuthResponse)
def register_endpoint(
    payload: AuthCredentials,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
) -> AuthResponse:
    email = validated_email(payload.email)
    validated_password(payload.password)

    try:
        user = create_user(email, hash_password(payload.password))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Email already registered.") from exc

    moved_trips = claim_client_trips(normalized_client_id(client_id), user_client_id(user.id))
    return AuthResponse(token=create_access_token(user), user=public_user(user), moved_trips=moved_trips)


@router.post("/login", response_model=AuthResponse)
def login_endpoint(
    payload: AuthCredentials,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
) -> AuthResponse:
    email = validated_email(payload.email)
    enforce_login_allowed(email)
    user = get_user_by_email(email)
    if user is None or not verify_password(payload.password, user.password_hash):
        record_login_failure(email)
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    clear_login_failures(email)
    moved_trips = claim_client_trips(normalized_client_id(client_id), user_client_id(user.id))
    return AuthResponse(token=create_access_token(user), user=public_user(user), moved_trips=moved_trips)


@router.get("/me", response_model=AuthUser)
def me_endpoint(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> AuthUser:
    return public_user(require_current_user(authorization))


@router.post("/claim-guest", response_model=ClaimGuestResponse)
def claim_guest_endpoint(
    payload: ClaimGuestRequest,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> ClaimGuestResponse:
    user = require_current_user(authorization)
    moved_trips = claim_client_trips(normalized_client_id(payload.guest_client_id), user_client_id(user.id))
    return ClaimGuestResponse(moved_trips=moved_trips)


def validated_email(value: str) -> str:
    try:
        return normalize_email(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def validated_password(value: str) -> None:
    try:
        validate_password(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def enforce_login_allowed(email: str) -> None:
    try:
        check_login_allowed(email)
    except LoginRateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

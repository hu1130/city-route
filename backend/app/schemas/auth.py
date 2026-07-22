from datetime import datetime

from app.schemas.base import CamelModel


class AuthUser(CamelModel):
    id: int
    email: str
    created_at: datetime


class UserRecord(AuthUser):
    password_hash: str


class AuthCredentials(CamelModel):
    email: str
    password: str


class AuthResponse(CamelModel):
    token: str
    user: AuthUser
    moved_trips: int = 0


class ClaimGuestRequest(CamelModel):
    guest_client_id: str


class ClaimGuestResponse(CamelModel):
    moved_trips: int = 0

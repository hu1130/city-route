from app.schemas.base import CamelModel


class ServiceStatus(CamelModel):
    key: str
    label: str
    status: str
    required: bool = False
    detail: str


class SystemStatusResponse(CamelModel):
    ok: bool
    app_env: str
    persistence_enabled: bool
    services: list[ServiceStatus]

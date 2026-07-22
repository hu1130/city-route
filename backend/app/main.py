from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.poi import router as poi_router
from app.api.routes.system import router as system_router
from app.api.routes.trips import router as trips_router
from app.core.config import get_settings
from app.core.logging_config import configure_logging
from app.core.request_logging import log_request
from app.core.security_headers import add_security_headers

settings = get_settings()
configure_logging(settings.log_level)
app = FastAPI(title="City Route MVP API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(add_security_headers)
app.middleware("http")(log_request)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(poi_router, prefix="/api/poi", tags=["poi"])
app.include_router(system_router, prefix="/api", tags=["system"])
app.include_router(trips_router, prefix="/api", tags=["trips"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

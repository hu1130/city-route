from fastapi import APIRouter, Response, status

from app.core.config import get_settings
from app.schemas.system import ServiceStatus, SystemStatusResponse
from app.storage.memory_store import storage_status

router = APIRouter()


@router.get("/system/status", response_model=SystemStatusResponse)
def system_status_endpoint() -> SystemStatusResponse:
    return build_system_status()


@router.get("/system/readiness", response_model=SystemStatusResponse)
def system_readiness_endpoint(response: Response) -> SystemStatusResponse:
    result = build_system_status()
    if not result.ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result


def build_system_status() -> SystemStatusResponse:
    settings = get_settings()
    storage = storage_status()
    services = [
        _configured_service(
            key="amap_web_service",
            label="高德 Web 服务",
            configured=bool(settings.amap_api_key),
            enabled=settings.use_amap and settings.app_env != "test",
            required=True,
            ready_detail="已配置，用于地点搜索、坐标解析和真实路径耗时。",
            missing_detail="缺少 AMAP_API_KEY，会回退到本地 mock 或估算逻辑。",
            disabled_detail="当前环境已关闭高德 Web 服务调用。",
        ),
        _configured_service(
            key="deepseek",
            label="DeepSeek 行程说明",
            configured=bool(settings.deepseek_api_key),
            enabled=settings.use_deepseek and settings.app_env != "test",
            required=False,
            ready_detail=f"已配置，当前模型为 {settings.deepseek_model}。",
            missing_detail="缺少 DEEPSEEK_API_KEY，会使用本地规则生成说明。",
            disabled_detail="当前环境已关闭 DeepSeek 调用。",
        ),
        ServiceStatus(
            key="persistence",
            label="行程保存",
            status=storage["status"],
            required=True,
            detail=storage["detail"],
        ),
    ]
    accepted_required_statuses = {"ready"} if settings.app_env == "production" else {"ready", "disabled"}
    ok = all(service.status in accepted_required_statuses for service in services if service.required)
    return SystemStatusResponse(
        ok=ok,
        app_env=settings.app_env,
        persistence_enabled=settings.persistence_enabled,
        services=services,
    )


def _configured_service(
    *,
    key: str,
    label: str,
    configured: bool,
    enabled: bool,
    required: bool,
    ready_detail: str,
    missing_detail: str,
    disabled_detail: str,
) -> ServiceStatus:
    if not enabled:
        return ServiceStatus(key=key, label=label, status="disabled", required=required, detail=disabled_detail)
    if configured:
        return ServiceStatus(key=key, label=label, status="ready", required=required, detail=ready_detail)
    return ServiceStatus(key=key, label=label, status="missing", required=required, detail=missing_detail)

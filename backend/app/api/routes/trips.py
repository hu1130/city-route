import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query

from app.api.identity import current_owner_id
from app.api.rate_limit import enforce_route_rate_limit
from app.schemas.route import GenerateRoutesRequest, RoutePlan, RoutePlansResponse
from app.schemas.trip import (
    CreateTripRequest,
    CreateTripResponse,
    ShareTripResponse,
    SharedTripResponse,
    TripHistoryResponse,
    TripRecord,
)
from app.services.route_planner import InsufficientTripTimeError, generate_route_plans
from app.storage.memory_store import (
    create_trip,
    count_trips,
    delete_trip,
    get_plan,
    get_trip,
    get_trip_by_share_token,
    list_plans_for_trip,
    list_trip_summaries,
    set_trip_share_token,
)

router = APIRouter()


@router.get("/trips", response_model=TripHistoryResponse)
def list_trips_endpoint(
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    limit: int = Query(default=12, ge=1, le=50),
) -> TripHistoryResponse:
    owner_id = current_owner_id(authorization, client_id)
    return TripHistoryResponse(trips=list_trip_summaries(limit=limit, client_id=owner_id), total=count_trips(owner_id))


@router.post("/trips", response_model=CreateTripResponse)
def create_trip_endpoint(
    payload: CreateTripRequest,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> CreateTripResponse:
    if len(payload.destinations) < 2 or len(payload.destinations) > 6:
        raise HTTPException(status_code=400, detail="MVP supports 2-6 destinations.")
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="endTime must be later than startTime.")

    trip = create_trip(payload, client_id=current_owner_id(authorization, client_id))
    return CreateTripResponse(trip_id=trip.id, status=trip.status)


@router.get("/trips/{trip_id}", response_model=TripRecord)
def get_trip_endpoint(
    trip_id: int,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> TripRecord:
    trip = get_trip(trip_id, client_id=current_owner_id(authorization, client_id))
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return trip


@router.delete("/trips/{trip_id}")
def delete_trip_endpoint(
    trip_id: int,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> dict[str, str]:
    if not delete_trip(trip_id, client_id=current_owner_id(authorization, client_id)):
        raise HTTPException(status_code=404, detail="Trip not found.")
    return {"status": "deleted"}


@router.get("/trips/{trip_id}/routes", response_model=RoutePlansResponse)
def list_routes_endpoint(
    trip_id: int,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> RoutePlansResponse:
    owner_id = current_owner_id(authorization, client_id)
    trip = get_trip(trip_id, client_id=owner_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return RoutePlansResponse(plans=list_plans_for_trip(trip_id, client_id=owner_id))


@router.post("/trips/{trip_id}/routes", response_model=RoutePlansResponse)
def generate_routes_endpoint(
    trip_id: int,
    payload: GenerateRoutesRequest | None = None,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> RoutePlansResponse:
    owner_id = current_owner_id(authorization, client_id)
    enforce_route_rate_limit(owner_id)
    trip = get_trip(trip_id, client_id=owner_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found.")

    try:
        plans = generate_route_plans(trip, fixed_order=payload.fixed_order if payload else False)
    except InsufficientTripTimeError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return RoutePlansResponse(plans=plans)


@router.get("/route-plans/{plan_id}", response_model=RoutePlan)
def get_route_plan_endpoint(
    plan_id: int,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> RoutePlan:
    plan = get_plan(plan_id, client_id=current_owner_id(authorization, client_id))
    if plan is None:
        raise HTTPException(status_code=404, detail="Route plan not found.")
    return plan


@router.post("/trips/{trip_id}/share", response_model=ShareTripResponse)
def share_trip_endpoint(
    trip_id: int,
    client_id: Annotated[str | None, Header(alias="X-Client-Id")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> ShareTripResponse:
    owner_id = current_owner_id(authorization, client_id)
    trip = get_trip(trip_id, client_id=owner_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found.")
    if trip.share_token:
        return ShareTripResponse(share_token=trip.share_token)

    for _ in range(5):
        share_token = secrets.token_urlsafe(18)
        if get_trip_by_share_token(share_token) is None:
            shared_trip = set_trip_share_token(trip_id, owner_id, share_token)
            if shared_trip is None:
                raise HTTPException(status_code=404, detail="Trip not found.")
            return ShareTripResponse(share_token=share_token)

    raise HTTPException(status_code=500, detail="Unable to create share link.")


@router.get("/shared-trips/{share_token}", response_model=SharedTripResponse)
def get_shared_trip_endpoint(share_token: str) -> SharedTripResponse:
    if len(share_token) < 12 or len(share_token) > 80:
        raise HTTPException(status_code=404, detail="Shared trip not found.")

    trip = get_trip_by_share_token(share_token)
    if trip is None:
        raise HTTPException(status_code=404, detail="Shared trip not found.")
    return SharedTripResponse(trip=trip, plans=list_plans_for_trip(trip.id, client_id=trip.client_id))

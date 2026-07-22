from datetime import datetime

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.poi import PlacePracticalInfo
from app.schemas.route import RoutePlan


class Location(CamelModel):
    name: str
    lat: float
    lng: float


class TripDestination(CamelModel):
    source: str = "mock"
    source_poi_id: str
    raw_name: str
    name: str
    address: str | None = None
    lat: float
    lng: float
    poi_type: str = "landmark"
    must_go: bool = False
    stay_minutes: int | None = None
    suggested_stay_minutes: int = 60
    risk_level: str = "low"
    tags: list[str] = Field(default_factory=list)
    note: str | None = None
    practical_info: PlacePracticalInfo = Field(default_factory=PlacePracticalInfo)


class CreateTripRequest(CamelModel):
    city: str
    start_location: Location
    start_time: datetime
    end_time: datetime
    transport_preference: str = "metro"
    pace: str = "balanced"
    traveler_style: str = "classic"
    destinations: list[TripDestination]


class TripRecord(CreateTripRequest):
    id: int
    client_id: str = "anonymous"
    status: str = "created"
    share_token: str | None = None


class CreateTripResponse(CamelModel):
    trip_id: int
    status: str


class TripSummary(CamelModel):
    trip_id: int
    client_id: str = "anonymous"
    city: str
    start_location_name: str
    start_time: datetime
    end_time: datetime
    traveler_style: str = "classic"
    destination_names: list[str] = Field(default_factory=list)
    status: str
    plan_count: int = 0


class TripHistoryResponse(CamelModel):
    trips: list[TripSummary] = Field(default_factory=list)
    total: int = 0


class ShareTripResponse(CamelModel):
    share_token: str


class SharedTripResponse(CamelModel):
    trip: TripRecord
    plans: list[RoutePlan] = Field(default_factory=list)

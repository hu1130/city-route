from datetime import datetime

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.poi import PlacePracticalInfo


class RouteStop(CamelModel):
    destination_id: str
    name: str
    lat: float | None = None
    lng: float | None = None
    arrival_time: datetime
    departure_time: datetime
    stay_minutes: int
    suggestion: str
    risk_level: str
    tags: list[str] = Field(default_factory=list)
    practical_info: PlacePracticalInfo = Field(default_factory=PlacePracticalInfo)


class RouteLeg(CamelModel):
    from_name: str
    to_name: str
    transport_mode: str
    duration_minutes: int
    distance_meters: int
    navigation_url: str
    source: str = "mock"


class RouteStopInsight(CamelModel):
    destination_id: str
    name: str
    highlight: str
    practical_note: str
    risk_note: str


class RouteInsight(CamelModel):
    source: str = "fallback"
    summary: str
    route_reason: str
    reminders: list[str] = Field(default_factory=list)
    stop_insights: list[RouteStopInsight] = Field(default_factory=list)


class WeatherSnapshot(CamelModel):
    source: str = "rule"
    city: str = ""
    weather: str = "待确认"
    temperature: str = ""
    wind: str = ""
    humidity: str = ""
    report_time: str = ""
    outdoor_risk: str = "low"
    alerts: list[str] = Field(default_factory=list)


class RoutePlan(CamelModel):
    plan_id: int
    trip_id: int | None = None
    title: str
    style: str
    total_minutes: int
    travel_minutes: int
    visit_minutes: int
    walking_level: str
    risk_level: str
    score: float
    estimated_end_time: datetime
    summary: str
    score_factors: list[str] = Field(default_factory=list)
    quality_notes: list[str] = Field(default_factory=list)
    decision_notes: list[str] = Field(default_factory=list)
    weather: WeatherSnapshot = Field(default_factory=WeatherSnapshot)
    stops: list[RouteStop]
    legs: list[RouteLeg]
    insight: RouteInsight | None = None


class RoutePlansResponse(CamelModel):
    plans: list[RoutePlan]


class GenerateRoutesRequest(CamelModel):
    fixed_order: bool = False

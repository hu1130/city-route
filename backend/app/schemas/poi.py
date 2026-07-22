from pydantic import Field

from app.schemas.base import CamelModel


class PoiSearchRequest(CamelModel):
    city: str
    keyword: str


class LocationResolveRequest(CamelModel):
    city: str
    keyword: str


class ReverseGeocodeRequest(CamelModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class LocationCandidate(CamelModel):
    source: str = "mock"
    name: str
    address: str
    lat: float
    lng: float
    city: str | None = None


class PlacePracticalInfo(CamelModel):
    source: str = "rule"
    confidence: str = "low"
    opening_hours: str = "需官方确认"
    ticket: str = "需官方确认"
    closure_status: str = "未接入官方实时闭馆数据"
    popularity: str = "需现场判断"
    tips: list[str] = Field(default_factory=list)


class PoiCandidate(CamelModel):
    source: str = "mock"
    source_poi_id: str
    name: str
    address: str
    lat: float
    lng: float
    poi_type: str
    suggested_stay_minutes: int
    risk_level: str = "low"
    tags: list[str] = Field(default_factory=list)
    note: str
    practical_info: PlacePracticalInfo = Field(default_factory=PlacePracticalInfo)


class PoiSearchResponse(CamelModel):
    candidates: list[PoiCandidate]


class LocationResolveResponse(CamelModel):
    location: LocationCandidate | None

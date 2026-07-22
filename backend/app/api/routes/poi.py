from fastapi import APIRouter, Request

from app.api.rate_limit import enforce_poi_rate_limit
from app.schemas.poi import (
    LocationResolveRequest,
    LocationResolveResponse,
    PoiSearchRequest,
    PoiSearchResponse,
    ReverseGeocodeRequest,
)
from app.services.poi_resolver import resolve_location, reverse_geocode_location, search_pois

router = APIRouter()


@router.post("/search", response_model=PoiSearchResponse)
def search_poi(payload: PoiSearchRequest, request: Request) -> PoiSearchResponse:
    enforce_poi_rate_limit(request)
    return PoiSearchResponse(candidates=search_pois(payload.city, payload.keyword))


@router.post("/geocode", response_model=LocationResolveResponse)
def geocode_location(payload: LocationResolveRequest, request: Request) -> LocationResolveResponse:
    enforce_poi_rate_limit(request)
    return LocationResolveResponse(location=resolve_location(payload.city, payload.keyword))


@router.post("/reverse-geocode", response_model=LocationResolveResponse)
def reverse_geocode(payload: ReverseGeocodeRequest, request: Request) -> LocationResolveResponse:
    enforce_poi_rate_limit(request)
    return LocationResolveResponse(location=reverse_geocode_location(payload.lat, payload.lng))

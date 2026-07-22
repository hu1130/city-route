import httpx

from app.core.config import get_settings
from app.schemas.poi import LocationCandidate, PoiCandidate
from app.services.amap_client import AmapClient, AmapClientError
from app.services.mock_data import ALIASES, MOCK_POIS


def resolve_location(city: str, keyword: str) -> LocationCandidate | None:
    normalized = keyword.strip().lower()
    if not normalized:
        return None

    settings = get_settings()
    if settings.amap_enabled:
        try:
            amap_location = AmapClient().geocode_location(city=city, keyword=keyword)
        except (AmapClientError, httpx.HTTPError, ValueError):
            amap_location = None
        if amap_location:
            return amap_location

    mock_matches = search_mock_pois(normalized)
    if not mock_matches:
        return None
    match = mock_matches[0]
    return LocationCandidate(
        source=match.source,
        name=match.name,
        address=match.address,
        lat=match.lat,
        lng=match.lng,
    )


def reverse_geocode_location(lat: float, lng: float) -> LocationCandidate:
    settings = get_settings()
    if settings.amap_enabled:
        try:
            amap_location = AmapClient().reverse_geocode_location(lat=lat, lng=lng)
        except (AmapClientError, httpx.HTTPError, ValueError):
            amap_location = None
        if amap_location:
            return amap_location

    return LocationCandidate(
        source="browser",
        name="当前位置",
        address=f"{lat:.6f},{lng:.6f}",
        lat=lat,
        lng=lng,
    )


def search_pois(city: str, keyword: str) -> list[PoiCandidate]:
    normalized = keyword.strip().lower()
    if not normalized:
        return []

    settings = get_settings()
    if settings.amap_enabled:
        try:
            amap_matches = AmapClient().search_pois(city=city, keyword=keyword)
        except (AmapClientError, httpx.HTTPError, ValueError):
            amap_matches = []
        if amap_matches:
            return amap_matches

    return search_mock_pois(normalized)


def search_mock_pois(normalized_keyword: str) -> list[PoiCandidate]:
    matches: list[PoiCandidate] = []
    for poi in MOCK_POIS:
        names = [poi.name, *ALIASES.get(poi.source_poi_id, [])]
        if any(normalized_keyword in name.lower() or name.lower() in normalized_keyword for name in names):
            matches.append(poi)

    return matches[:5]

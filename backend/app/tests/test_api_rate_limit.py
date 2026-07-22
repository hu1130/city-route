from app.core.config import get_settings
from app.services.api_rate_limiter import reset_api_rate_limits


def test_poi_rate_limit_blocks_repeated_requests(client, monkeypatch):
    monkeypatch.setenv("CITY_ROUTE_POI_RATE_LIMIT_MAX_REQUESTS", "1")
    monkeypatch.setenv("CITY_ROUTE_POI_RATE_LIMIT_WINDOW_SECONDS", "60")
    get_settings.cache_clear()
    reset_api_rate_limits()

    payload = {"city": "Shanghai", "keyword": "Bund"}
    first = client.post("/api/poi/search", json=payload)
    second = client.post("/api/poi/search", json=payload)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["retry-after"]


def test_route_generation_rate_limit_blocks_repeated_requests(client, monkeypatch):
    monkeypatch.setenv("CITY_ROUTE_ROUTE_RATE_LIMIT_MAX_REQUESTS", "1")
    monkeypatch.setenv("CITY_ROUTE_ROUTE_RATE_LIMIT_WINDOW_SECONDS", "60")
    get_settings.cache_clear()
    reset_api_rate_limits()

    headers = {"X-Client-Id": "rate_limit_route"}
    trip_response = client.post("/api/trips", json=trip_payload(), headers=headers)
    assert trip_response.status_code == 200
    trip_id = trip_response.json()["tripId"]

    first = client.post(f"/api/trips/{trip_id}/routes", json={"fixedOrder": False}, headers=headers)
    second = client.post(f"/api/trips/{trip_id}/routes", json={"fixedOrder": False}, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["retry-after"]


def trip_payload() -> dict:
    return {
        "city": "Shanghai",
        "startLocation": {"name": "People Square", "lat": 31.2304, "lng": 121.4737},
        "startTime": "2026-07-08T15:00:00+08:00",
        "endTime": "2026-07-08T21:00:00+08:00",
        "transportPreference": "metro",
        "pace": "balanced",
        "travelerStyle": "classic",
        "destinations": [
            destination_payload("poi_1"),
            destination_payload("poi_2"),
        ],
    }


def destination_payload(source_poi_id: str) -> dict:
    return {
        "source": "test",
        "sourcePoiId": source_poi_id,
        "rawName": source_poi_id,
        "name": source_poi_id,
        "address": source_poi_id,
        "lat": 31.23,
        "lng": 121.48,
        "poiType": "landmark",
        "mustGo": False,
        "stayMinutes": None,
        "suggestedStayMinutes": 60,
        "riskLevel": "low",
        "tags": ["test"],
        "note": "test",
    }

def test_create_and_read_shared_trip(client):
    owner_headers = {"X-Client-Id": "guest_share_owner"}
    trip_id = create_trip(client, owner_headers)
    routes_response = client.post(f"/api/trips/{trip_id}/routes", json={}, headers=owner_headers)
    assert routes_response.status_code == 200

    share_response = client.post(f"/api/trips/{trip_id}/share", headers=owner_headers)
    assert share_response.status_code == 200
    share_token = share_response.json()["shareToken"]
    assert share_token

    second_share_response = client.post(f"/api/trips/{trip_id}/share", headers=owner_headers)
    assert second_share_response.json()["shareToken"] == share_token

    public_response = client.get(f"/api/shared-trips/{share_token}")
    assert public_response.status_code == 200
    data = public_response.json()
    assert data["trip"]["id"] == trip_id
    assert len(data["plans"]) >= 1


def test_only_owner_can_create_share_link(client):
    owner_headers = {"X-Client-Id": "guest_share_owner"}
    other_headers = {"X-Client-Id": "guest_share_other"}
    trip_id = create_trip(client, owner_headers)

    assert client.post(f"/api/trips/{trip_id}/share", headers=other_headers).status_code == 404


def create_trip(client, headers: dict[str, str]) -> int:
    response = client.post("/api/trips", json=trip_payload(), headers=headers)
    assert response.status_code == 200
    return response.json()["tripId"]


def trip_payload() -> dict:
    return {
        "city": "上海",
        "startLocation": {"name": "人民广场", "lat": 31.2304, "lng": 121.4737},
        "startTime": "2026-06-29T15:00:00+08:00",
        "endTime": "2026-06-29T21:00:00+08:00",
        "transportPreference": "metro",
        "pace": "balanced",
        "travelerStyle": "classic",
        "destinations": [
            destination_payload("share_poi_1"),
            destination_payload("share_poi_2"),
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

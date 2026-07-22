from app.storage.memory_store import get_trip


def test_register_claims_guest_trips(client):
    guest_headers = {"X-Client-Id": "guest_auth_register"}
    trip_response = client.post("/api/trips", json=trip_payload(), headers=guest_headers)
    assert trip_response.status_code == 200
    trip_id = trip_response.json()["tripId"]

    register_response = client.post(
        "/api/auth/register",
        json={"email": "owner@example.com", "password": "secret1"},
        headers=guest_headers,
    )

    assert register_response.status_code == 200
    auth_data = register_response.json()
    assert auth_data["token"]
    assert auth_data["user"]["email"] == "owner@example.com"
    assert auth_data["movedTrips"] == 1

    auth_headers = {"Authorization": f"Bearer {auth_data['token']}"}
    user_history = client.get("/api/trips", headers=auth_headers).json()
    guest_history = client.get("/api/trips", headers=guest_headers).json()

    assert [trip["tripId"] for trip in user_history["trips"]] == [trip_id]
    assert guest_history["trips"] == []
    assert get_trip(trip_id, client_id=f"user:{auth_data['user']['id']}") is not None


def test_login_claims_guest_trips_and_rejects_wrong_password(client):
    register_response = client.post(
        "/api/auth/register",
        json={"email": "login@example.com", "password": "secret1"},
        headers={"X-Client-Id": "guest_initial"},
    )
    assert register_response.status_code == 200

    guest_headers = {"X-Client-Id": "guest_auth_login"}
    trip_response = client.post("/api/trips", json=trip_payload(), headers=guest_headers)
    assert trip_response.status_code == 200
    trip_id = trip_response.json()["tripId"]

    bad_login = client.post("/api/auth/login", json={"email": "login@example.com", "password": "wrongpw"})
    assert bad_login.status_code == 401

    login_response = client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "secret1"},
        headers=guest_headers,
    )

    assert login_response.status_code == 200
    login_data = login_response.json()
    assert login_data["movedTrips"] == 1
    auth_headers = {"Authorization": f"Bearer {login_data['token']}"}
    user_history = client.get("/api/trips", headers=auth_headers).json()
    assert trip_id in [trip["tripId"] for trip in user_history["trips"]]


def test_authorization_takes_precedence_over_client_id(client):
    register_response = client.post(
        "/api/auth/register",
        json={"email": "precedence@example.com", "password": "secret1"},
        headers={"X-Client-Id": "guest_precedence"},
    )
    token = register_response.json()["token"]
    auth_headers = {"Authorization": f"Bearer {token}", "X-Client-Id": "guest_other"}

    trip_response = client.post("/api/trips", json=trip_payload(), headers=auth_headers)
    assert trip_response.status_code == 200
    trip_id = trip_response.json()["tripId"]

    assert client.get(f"/api/trips/{trip_id}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/trips/{trip_id}", headers={"X-Client-Id": "guest_other"}).status_code == 404


def test_me_requires_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"}).status_code == 401


def test_login_rate_limit_blocks_repeated_failures(client):
    register_response = client.post(
        "/api/auth/register",
        json={"email": "rate-limit@example.com", "password": "secret1"},
    )
    assert register_response.status_code == 200

    for _ in range(5):
        response = client.post(
            "/api/auth/login",
            json={"email": "rate-limit@example.com", "password": "wrongpw"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/auth/login",
        json={"email": "rate-limit@example.com", "password": "secret1"},
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"]


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

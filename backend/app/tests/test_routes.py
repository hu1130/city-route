from datetime import datetime, timedelta

from app.core.config import _env_value, _read_env_file
from app.services.poi_resolver import search_pois
from app.services.amap_client import AmapClient
from app.services.deepseek_client import _parse_json_object
from app.schemas.route import RouteLeg, WeatherSnapshot
from app.services.route_planner import (
    PACES,
    TRANSPORTS,
    amap_mode_fallbacks,
    apply_traveler_style_to_pace,
    build_decision_notes,
    build_quality_notes,
    destination_subsets,
    stay_minutes_for_destination,
)
from app.schemas.trip import CreateTripRequest, Location, TripDestination, TripRecord
from app.storage.memory_store import create_trip as store_create_trip
from app.storage.memory_store import get_trip, reload_store, reset_store, storage_status


def destination_payload(raw_name: str) -> dict:
    poi = search_pois("上海", raw_name)[0]
    data = poi.model_dump(by_alias=True)
    return {
        "source": data["source"],
        "sourcePoiId": data["sourcePoiId"],
        "rawName": raw_name,
        "name": data["name"],
        "address": data["address"],
        "lat": data["lat"],
        "lng": data["lng"],
        "poiType": data["poiType"],
        "mustGo": False,
        "stayMinutes": None,
        "suggestedStayMinutes": data["suggestedStayMinutes"],
        "riskLevel": data["riskLevel"],
        "tags": data["tags"],
        "note": data["note"],
    }


def trip_payload(destination_names: list[str] | None = None) -> dict:
    names = destination_names or ["武康路", "外滩", "豫园", "新天地"]
    return {
        "city": "上海",
        "startLocation": {"name": "人民广场", "lat": 31.2304, "lng": 121.4737},
        "startTime": "2026-06-29T15:00:00+08:00",
        "endTime": "2026-06-29T21:00:00+08:00",
        "transportPreference": "metro",
        "pace": "balanced",
        "travelerStyle": "classic",
        "destinations": [destination_payload(name) for name in names],
    }


def make_test_destination(source_poi_id: str, poi_type: str = "landmark", must_go: bool = False) -> TripDestination:
    return TripDestination(
        source_poi_id=source_poi_id,
        raw_name=source_poi_id,
        name=source_poi_id,
        address=source_poi_id,
        lat=31.23,
        lng=121.48,
        poi_type=poi_type,
        must_go=must_go,
        suggested_stay_minutes=60,
        risk_level="low",
        note="test",
    )


def create_trip(client, payload: dict | None = None, headers: dict[str, str] | None = None) -> int:
    response = client.post("/api/trips", json=payload or trip_payload(), headers=headers)
    assert response.status_code == 200
    return response.json()["tripId"]


def test_create_trip(client):
    trip_id = create_trip(client)
    assert trip_id == 1001


def test_system_status_does_not_expose_secrets(client):
    response = client.get("/api/system/status")
    assert response.status_code == 200
    data = response.json()
    assert data["appEnv"] == "test"
    assert isinstance(data["ok"], bool)
    assert data["services"]
    rendered = str(data)
    assert "sk-" not in rendered
    assert "AMAP_API_KEY" not in rendered


def test_blank_process_env_does_not_override_env_file(monkeypatch):
    monkeypatch.setenv("AMAP_API_KEY", " ")
    assert _env_value("AMAP_API_KEY", {"AMAP_API_KEY": "file-value"}) == "file-value"


def test_env_file_parser_strips_utf8_bom(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text("\ufeffAMAP_API_KEY=file-value\n", encoding="utf-8")
    values = _read_env_file(env_path)
    assert values["AMAP_API_KEY"] == "file-value"


def test_list_trip_history(client):
    trip_id = create_trip(client)
    client.post(f"/api/trips/{trip_id}/routes", json={})

    response = client.get("/api/trips")
    assert response.status_code == 200
    trips = response.json()["trips"]
    assert len(trips) == 1
    assert trips[0]["tripId"] == trip_id
    assert trips[0]["city"] == "上海"
    assert trips[0]["planCount"] == 3
    assert trips[0]["destinationNames"]
    assert response.json()["total"] == 1


def test_trip_history_is_scoped_by_client_id(client):
    alice_headers = {"X-Client-Id": "guest_alice"}
    bob_headers = {"X-Client-Id": "guest_bob"}
    alice_trip_id = create_trip(client, headers=alice_headers)
    bob_trip_id = create_trip(client, headers=bob_headers)
    bob_routes = client.post(f"/api/trips/{bob_trip_id}/routes", json={}, headers=bob_headers)
    assert bob_routes.status_code == 200
    bob_plan_id = bob_routes.json()["plans"][0]["planId"]

    alice_history = client.get("/api/trips", headers=alice_headers).json()
    bob_history = client.get("/api/trips", headers=bob_headers).json()

    assert alice_history["total"] == 1
    assert [trip["tripId"] for trip in alice_history["trips"]] == [alice_trip_id]
    assert bob_history["total"] == 1
    assert [trip["tripId"] for trip in bob_history["trips"]] == [bob_trip_id]
    assert client.get(f"/api/trips/{bob_trip_id}", headers=alice_headers).status_code == 404
    assert client.get(f"/api/trips/{bob_trip_id}/routes", headers=alice_headers).status_code == 404
    assert client.get(f"/api/route-plans/{bob_plan_id}", headers=alice_headers).status_code == 404
    assert client.delete(f"/api/trips/{bob_trip_id}", headers=alice_headers).status_code == 404


def test_list_trip_history_limit_returns_latest_and_total(client):
    first_trip_id = create_trip(client)
    second_trip_id = create_trip(client)
    third_trip_id = create_trip(client)

    response = client.get("/api/trips?limit=2")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert [trip["tripId"] for trip in data["trips"]] == [third_trip_id, second_trip_id]
    assert first_trip_id not in [trip["tripId"] for trip in data["trips"]]


def test_get_trip(client):
    trip_id = create_trip(client)
    response = client.get(f"/api/trips/{trip_id}")
    assert response.status_code == 200
    assert response.json()["id"] == trip_id


def test_trip_keeps_traveler_style_and_routes_explain_it(client):
    payload = trip_payload()
    payload["travelerStyle"] = "couple"
    trip_id = create_trip(client, payload)

    trip_response = client.get(f"/api/trips/{trip_id}")
    assert trip_response.status_code == 200
    assert trip_response.json()["travelerStyle"] == "couple"

    route_response = client.post(f"/api/trips/{trip_id}/routes", json={})
    assert route_response.status_code == 200
    first_plan = route_response.json()["plans"][0]
    assert any("情侣玩法" in note for note in first_plan["qualityNotes"])
    assert "夜景" in first_plan["insight"]["routeReason"]


def test_list_saved_routes_for_trip(client):
    trip_id = create_trip(client)
    client.post(f"/api/trips/{trip_id}/routes", json={})

    response = client.get(f"/api/trips/{trip_id}/routes")
    assert response.status_code == 200
    plans = response.json()["plans"]
    assert len(plans) == 3
    assert {plan["tripId"] for plan in plans} == {trip_id}


def test_delete_trip_removes_history_and_plans(client):
    trip_id = create_trip(client)
    route_response = client.post(f"/api/trips/{trip_id}/routes", json={})
    plan_id = route_response.json()["plans"][0]["planId"]

    delete_response = client.delete(f"/api/trips/{trip_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "deleted"

    assert client.get(f"/api/trips/{trip_id}").status_code == 404
    assert client.get(f"/api/route-plans/{plan_id}").status_code == 404
    assert client.get("/api/trips").json()["trips"] == []


def test_create_trip_rejects_too_few_destinations(client):
    response = client.post("/api/trips", json=trip_payload(["武康路"]))
    assert response.status_code == 400
    assert "2-6" in response.json()["detail"]


def test_create_trip_accepts_two_destinations(client):
    trip_id = create_trip(client, trip_payload(["武康路", "外滩"]))
    response = client.post(f"/api/trips/{trip_id}/routes", json={})

    assert response.status_code == 200
    plans = response.json()["plans"]
    assert plans
    assert all(len(plan["stops"]) == 2 for plan in plans)


def test_create_trip_rejects_too_many_destinations(client):
    payload = trip_payload(["武康路", "外滩", "豫园", "新天地", "上海博物馆", "南京路", "田子坊"])
    response = client.post("/api/trips", json=payload)
    assert response.status_code == 400


def test_create_trip_rejects_invalid_time_range(client):
    payload = trip_payload()
    payload["endTime"] = "2026-06-29T14:00:00+08:00"
    response = client.post("/api/trips", json=payload)
    assert response.status_code == 400
    assert "later" in response.json()["detail"]


def test_generate_routes(client):
    trip_id = create_trip(client)
    response = client.post(f"/api/trips/{trip_id}/routes", json={})
    assert response.status_code == 200
    plans = response.json()["plans"]
    assert len(plans) == 3
    assert {plan["style"] for plan in plans} == {"recommended", "relaxed", "compact"}

    first = plans[0]
    assert first["stops"]
    assert first["legs"]
    assert first["insight"]["source"] == "fallback"
    assert first["insight"]["stopInsights"]
    assert first["qualityNotes"]
    assert all(isinstance(note, str) and note for note in first["qualityNotes"])
    assert first["scoreFactors"]
    assert all(isinstance(factor, str) and factor for factor in first["scoreFactors"])
    assert first["decisionNotes"]
    assert all(isinstance(note, str) and note for note in first["decisionNotes"])
    assert first["weather"]["city"] == "上海"
    assert first["weather"]["outdoorRisk"] in {"low", "medium", "high"}
    assert first["weather"]["alerts"]
    assert first["totalMinutes"] == first["travelMinutes"] + first["visitMinutes"]
    assert len(first["stops"]) == len(first["legs"])
    assert first["stops"][0]["practicalInfo"]["openingHours"] == "需官方确认"

    for stop in first["stops"]:
        assert stop["arrivalTime"] < stop["departureTime"]
        assert isinstance(stop["lat"], float)
        assert isinstance(stop["lng"], float)
    assert {leg["source"] for leg in first["legs"]} == {"estimated"}

    route_keys = {
        ">".join(stop["destinationId"] for stop in plan["stops"])
        for plan in plans
    }
    assert len(route_keys) >= 2


def test_quality_notes_include_meal_and_overtime_guidance():
    payload = CreateTripRequest.model_validate(trip_payload())
    trip = TripRecord(id=1, client_id="guest_test", **payload.model_dump())
    arrival = datetime(2026, 6, 29, 18, 20)
    departure = arrival + timedelta(minutes=70)
    end_time = trip.end_time + timedelta(minutes=25)
    destination = trip.destinations[0]
    schedule = {
        "stops": [
            {
                "destination": destination,
                "arrival_time": arrival,
                "departure_time": departure,
                "stay_minutes": 70,
                "time_match": True,
            }
        ],
        "legs": [
            RouteLeg(
                from_name=trip.start_location.name,
                to_name=destination.name,
                transport_mode="metro",
                duration_minutes=35,
                distance_meters=5000,
                navigation_url="https://example.test/nav",
                source="estimated",
            )
        ],
        "total_minutes": 105,
        "travel_minutes": 35,
        "visit_minutes": 70,
        "walking_load": 2,
        "risk_level": "low",
        "end_time": end_time,
    }

    notes = build_quality_notes([destination], schedule, "recommended", "classic", trip)

    assert any("晚饭" in note for note in notes)
    assert any("超时" in note for note in notes)


def test_quality_notes_warn_against_forcing_far_places():
    payload = CreateTripRequest.model_validate(trip_payload())
    trip = TripRecord(id=1, client_id="guest_test", **payload.model_dump())
    first = trip.destinations[0]
    second = trip.destinations[1]
    arrival = trip.start_time + timedelta(hours=1)
    schedule = {
        "stops": [
            {
                "destination": first,
                "arrival_time": arrival,
                "departure_time": arrival + timedelta(minutes=60),
                "stay_minutes": 60,
                "time_match": True,
            },
            {
                "destination": second,
                "arrival_time": arrival + timedelta(minutes=130),
                "departure_time": arrival + timedelta(minutes=190),
                "stay_minutes": 60,
                "time_match": True,
            },
        ],
        "legs": [
            RouteLeg(
                from_name=trip.start_location.name,
                to_name=first.name,
                transport_mode="metro",
                duration_minutes=25,
                distance_meters=4500,
                navigation_url="https://example.test/nav",
                source="estimated",
            ),
            RouteLeg(
                from_name=first.name,
                to_name=second.name,
                transport_mode="metro",
                duration_minutes=72,
                distance_meters=22_000,
                navigation_url="https://example.test/nav",
                source="estimated",
            ),
        ],
        "total_minutes": 190,
        "travel_minutes": 97,
        "visit_minutes": 120,
        "walking_load": 3,
        "risk_level": "low",
        "end_time": arrival + timedelta(minutes=190),
    }

    notes = build_quality_notes([first, second], schedule, "recommended", "classic", trip)

    assert any("建议少排可选点" in note for note in notes)


def test_quality_notes_explain_weather_fit():
    payload = CreateTripRequest.model_validate(trip_payload())
    trip = TripRecord(id=1, client_id="guest_test", **payload.model_dump())
    destination = make_test_destination("上海博物馆", "museum")
    arrival = trip.start_time
    schedule = {
        "stops": [
            {
                "destination": destination,
                "arrival_time": arrival,
                "departure_time": arrival + timedelta(minutes=75),
                "stay_minutes": 75,
                "time_match": True,
            }
        ],
        "legs": [
            RouteLeg(
                from_name=trip.start_location.name,
                to_name=destination.name,
                transport_mode="metro",
                duration_minutes=20,
                distance_meters=3000,
                navigation_url="https://example.test/nav",
                source="estimated",
            )
        ],
        "total_minutes": 95,
        "travel_minutes": 20,
        "visit_minutes": 75,
        "walking_load": 1.2,
        "risk_level": "low",
        "end_time": arrival + timedelta(minutes=95),
    }
    weather = WeatherSnapshot(source="amap", city="上海", weather="大雨", outdoor_risk="high")

    notes = build_quality_notes([destination], schedule, "recommended", "family", trip, weather)

    assert any("天气" in note and "室内" in note for note in notes)


def test_decision_notes_explain_omitted_destination_and_stay_adjustment():
    selected = make_test_destination("selected_museum", "museum")
    omitted = make_test_destination("omitted_high_risk", "landmark")
    omitted.risk_level = "high"
    trip = TripRecord(
        id=1,
        client_id="guest_test",
        city="test city",
        start_location=Location(name="start", lat=31.23, lng=121.47),
        start_time=datetime(2026, 6, 29, 9, 0),
        end_time=datetime(2026, 6, 29, 12, 0),
        transport_preference="metro",
        pace="balanced",
        traveler_style="senior",
        destinations=[selected, omitted],
    )
    arrival = datetime(2026, 6, 29, 9, 20)
    schedule = {
        "stops": [
            {
                "destination": selected,
                "arrival_time": arrival,
                "departure_time": arrival + timedelta(minutes=72),
                "stay_minutes": 72,
                "time_match": True,
            }
        ],
        "legs": [],
        "total_minutes": 72,
        "travel_minutes": 0,
        "visit_minutes": 72,
        "walking_load": 0,
        "risk_level": "low",
        "end_time": arrival + timedelta(minutes=72),
    }

    notes = build_decision_notes(trip, [selected], schedule, "recommended")

    assert any("omitted_high_risk" in note for note in notes)
    assert any("selected_museum" in note and "60" in note and "72" in note for note in notes)


def test_traveler_style_changes_default_stay_without_overriding_user_input():
    destination = make_test_destination("museum", "museum")
    classic_stay = stay_minutes_for_destination(destination, PACES["balanced"], "classic")
    senior_stay = stay_minutes_for_destination(
        destination,
        apply_traveler_style_to_pace(PACES["balanced"], "senior"),
        "senior",
    )
    intense_stay = stay_minutes_for_destination(
        destination,
        apply_traveler_style_to_pace(PACES["balanced"], "intense"),
        "intense",
    )

    assert senior_stay > classic_stay
    assert intense_stay < classic_stay

    destination.stay_minutes = 45
    assert stay_minutes_for_destination(destination, PACES["balanced"], "senior") == 45
    assert stay_minutes_for_destination(destination, PACES["balanced"], "intense") == 45


def test_traveler_style_changes_candidate_coverage():
    destinations = [make_test_destination(f"poi_{index}") for index in range(6)]

    senior_subsets = destination_subsets(destinations, traveler_style="senior", pace="balanced")
    intense_subsets = destination_subsets(destinations, traveler_style="intense", pace="compact")

    assert max(len(subset) for subset in senior_subsets) == 4
    assert min(len(subset) for subset in intense_subsets) >= 5


def test_generate_routes_with_fixed_order(client):
    payload = trip_payload()
    payload["destinations"] = list(reversed(payload["destinations"]))
    expected_order = [destination["sourcePoiId"] for destination in payload["destinations"]]

    trip_id = create_trip(client, payload)
    response = client.post(f"/api/trips/{trip_id}/routes", json={"fixedOrder": True})

    assert response.status_code == 200
    plans = response.json()["plans"]
    assert len(plans) == 1
    assert [stop["destinationId"] for stop in plans[0]["stops"]] == expected_order

    saved_response = client.get(f"/api/trips/{trip_id}/routes")
    assert saved_response.status_code == 200
    assert len(saved_response.json()["plans"]) == 1


def test_generate_routes_keeps_must_go_destinations(client):
    payload = trip_payload()
    payload["destinations"][-1]["mustGo"] = True
    must_go_id = payload["destinations"][-1]["sourcePoiId"]

    trip_id = create_trip(client, payload)
    response = client.post(f"/api/trips/{trip_id}/routes", json={})

    assert response.status_code == 200
    plans = response.json()["plans"]
    assert len(plans) == 3
    for plan in plans:
        assert must_go_id in {stop["destinationId"] for stop in plan["stops"]}


def test_recommended_route_omits_far_optional_destination(client):
    payload = trip_payload()
    far = payload["destinations"][-1]
    far.update(
        {
            "sourcePoiId": "far_optional",
            "rawName": "远距离可选点",
            "name": "远距离可选点",
            "address": "远距离测试地址",
            "lat": 31.02,
            "lng": 121.95,
            "poiType": "landmark",
            "mustGo": False,
            "suggestedStayMinutes": 45,
            "riskLevel": "low",
            "tags": ["地标"],
            "note": "test",
        }
    )

    trip_id = create_trip(client, payload)
    response = client.post(f"/api/trips/{trip_id}/routes", json={})

    assert response.status_code == 200
    first_plan_ids = {stop["destinationId"] for stop in response.json()["plans"][0]["stops"]}
    assert "far_optional" not in first_plan_ids


def test_generate_routes_uses_custom_stay_minutes(client):
    payload = trip_payload()
    payload["destinations"][0]["mustGo"] = True
    payload["destinations"][0]["stayMinutes"] = 45
    destination_id = payload["destinations"][0]["sourcePoiId"]

    trip_id = create_trip(client, payload)
    response = client.post(f"/api/trips/{trip_id}/routes", json={})

    assert response.status_code == 200
    first_plan = response.json()["plans"][0]
    matching_stop = next(stop for stop in first_plan["stops"] if stop["destinationId"] == destination_id)
    assert matching_stop["stayMinutes"] == 45


def test_get_route_plan(client):
    trip_id = create_trip(client)
    route_response = client.post(f"/api/trips/{trip_id}/routes", json={})
    plan_id = route_response.json()["plans"][0]["planId"]

    response = client.get(f"/api/route-plans/{plan_id}")
    assert response.status_code == 200
    assert response.json()["planId"] == plan_id


def test_missing_trip_returns_404(client):
    response = client.post("/api/trips/9999/routes", json={})
    assert response.status_code == 404


def test_missing_trip_detail_returns_404(client):
    response = client.get("/api/trips/9999")
    assert response.status_code == 404


def test_missing_trip_delete_returns_404(client):
    response = client.delete("/api/trips/9999")
    assert response.status_code == 404


def test_missing_trip_saved_routes_returns_404(client):
    response = client.get("/api/trips/9999/routes")
    assert response.status_code == 404


def test_missing_plan_returns_404(client):
    response = client.get("/api/route-plans/9999")
    assert response.status_code == 404


def test_file_persistence_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("CITY_ROUTE_USE_PERSISTENCE", "true")
    monkeypatch.setenv("CITY_ROUTE_STORAGE_PATH", str(tmp_path / "store.json"))
    monkeypatch.setenv("CITY_ROUTE_USE_AMAP", "false")
    monkeypatch.setenv("CITY_ROUTE_USE_DEEPSEEK", "false")

    from app.core.config import get_settings

    get_settings.cache_clear()
    trip = store_create_trip(CreateTripRequest.model_validate(trip_payload()))
    reload_store()

    restored = get_trip(trip.id)
    assert restored is not None
    assert restored.id == trip.id
    assert restored.city == "上海"


def test_mysql_unavailable_falls_back_to_json(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("CITY_ROUTE_USE_PERSISTENCE", "true")
    monkeypatch.setenv("CITY_ROUTE_STORAGE_BACKEND", "mysql")
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://user:password@127.0.0.1:1/city_route_mvp")
    monkeypatch.setenv("CITY_ROUTE_STORAGE_PATH", str(tmp_path / "fallback-store.json"))
    monkeypatch.setenv("CITY_ROUTE_USE_AMAP", "false")
    monkeypatch.setenv("CITY_ROUTE_USE_DEEPSEEK", "false")

    from app.core.config import get_settings

    get_settings.cache_clear()
    reset_store()
    trip = store_create_trip(CreateTripRequest.model_validate(trip_payload()))
    status = storage_status()

    assert trip.id == 1001
    assert status["backend"] == "json"
    assert status["status"] == "ready"
    assert get_trip(trip.id) is not None


def test_amap_direction_builds_route_leg(monkeypatch):
    client = AmapClient(api_key="fake")

    def fake_request(city, origin, destination, mode):
        return {
            "status": "1",
            "route": {
                "paths": [
                    {
                        "duration": "780",
                        "distance": "3200",
                    }
                ]
            },
        }

    monkeypatch.setattr(client, "_request_direction", fake_request)
    leg = client.build_direction_leg(
        city="上海",
        origin=Location(name="人民广场", lat=31.2304, lng=121.4737),
        destination=TripDestination(
            source_poi_id="the_bund",
            raw_name="外滩",
            name="外滩",
            address="中山东一路",
            lat=31.2397,
            lng=121.4903,
        ),
        transport_label="步行优先",
        mode="walk",
        navigation_url="https://example.test/nav",
    )

    assert leg.source == "amap"
    assert leg.duration_minutes == 13
    assert leg.distance_meters == 3200


def test_amap_mode_fallbacks_for_metro_preference():
    assert amap_mode_fallbacks(TRANSPORTS["metro"]) == [
        ("integrated", "地铁优先"),
        ("car", "打车优先"),
        ("walk", "步行优先"),
    ]


def test_parse_deepseek_json_from_markdown_fence():
    parsed = _parse_json_object(
        """```json
        {"summary":"路线合理","routeReason":"距离较近","reminders":["确认营业时间"],"stopInsights":[]}
        ```"""
    )
    assert parsed["summary"] == "路线合理"

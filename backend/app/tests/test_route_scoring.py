from datetime import datetime, timedelta

from app.schemas.route import RouteLeg, WeatherSnapshot
from app.schemas.trip import Location, TripDestination, TripRecord
from app.services.city_strategy import city_strategy_decision_note, city_strategy_score
from app.services.route_scoring import (
    score_crowd_and_risk,
    score_long_optional_moves,
    score_meal_fit,
    score_route_candidate,
    score_schedule,
    score_traveler_style,
    score_weather_fit,
)


def make_trip() -> TripRecord:
    return TripRecord(
        id=1,
        city="Shanghai",
        start_location=Location(name="Start", lat=31.2304, lng=121.4737),
        start_time=datetime.fromisoformat("2026-06-29T15:00:00+08:00"),
        end_time=datetime.fromisoformat("2026-06-29T21:00:00+08:00"),
        transport_preference="metro",
        pace="balanced",
        destinations=[],
    )


def make_destination(source_poi_id: str, poi_type: str, risk_level: str = "low") -> TripDestination:
    return TripDestination(
        source_poi_id=source_poi_id,
        raw_name=source_poi_id,
        name=source_poi_id,
        address=source_poi_id,
        lat=31.23,
        lng=121.48,
        poi_type=poi_type,
        suggested_stay_minutes=60,
        risk_level=risk_level,
        note="test",
    )


def make_stop(destination: TripDestination, arrival: str, time_match: bool) -> dict:
    arrival_time = datetime.fromisoformat(arrival)
    return {
        "destination": destination,
        "arrival_time": arrival_time,
        "departure_time": arrival_time + timedelta(minutes=60),
        "stay_minutes": 60,
        "time_match": time_match,
    }


def make_leg(duration_minutes: int) -> RouteLeg:
    return RouteLeg(
        from_name="A",
        to_name="B",
        transport_mode="metro",
        duration_minutes=duration_minutes,
        distance_meters=duration_minutes * 120,
        navigation_url="https://example.test/nav",
        source="estimated",
    )


def make_schedule(stops: list[dict], travel_minutes: int = 30, visit_minutes: int | None = None) -> dict:
    if visit_minutes is None:
        visit_minutes = sum(stop["stay_minutes"] for stop in stops)
    return {
        "stops": stops,
        "legs": [make_leg(round(travel_minutes / max(1, len(stops)))) for _ in stops],
        "total_minutes": travel_minutes + visit_minutes,
        "travel_minutes": travel_minutes,
        "visit_minutes": visit_minutes,
        "walking_load": 2.0,
        "risk_level": "low",
        "end_time": stops[-1]["departure_time"],
    }


def test_score_prefers_night_view_later_in_the_day():
    trip = make_trip()
    bund = make_destination("bund", "night_view")
    early = make_schedule([make_stop(bund, "2026-06-29T16:00:00+08:00", False)])
    late = make_schedule([make_stop(bund, "2026-06-29T19:10:00+08:00", True)])

    assert score_schedule(late, trip, 360) > score_schedule(early, trip, 360) + 10


def test_score_penalizes_museum_arriving_too_late():
    trip = make_trip()
    museum = make_destination("museum", "museum")
    early = make_schedule([make_stop(museum, "2026-06-29T13:30:00+08:00", True)])
    late = make_schedule([make_stop(museum, "2026-06-29T18:30:00+08:00", False)])

    assert score_schedule(early, trip, 360) > score_schedule(late, trip, 360) + 10


def test_score_penalizes_travel_heavy_routes():
    trip = make_trip()
    destination = make_destination("citywalk", "citywalk")
    good = make_schedule([make_stop(destination, "2026-06-29T16:00:00+08:00", True)], travel_minutes=25, visit_minutes=120)
    heavy = make_schedule([make_stop(destination, "2026-06-29T16:00:00+08:00", True)], travel_minutes=150, visit_minutes=60)

    assert score_schedule(good, trip, 360) > score_schedule(heavy, trip, 360) + 15


def test_traveler_style_rewards_matching_place_features():
    food_stop = make_stop(make_destination("snack_street", "historic"), "2026-06-29T18:00:00+08:00", True)
    food_stop["destination"].tags = ["小吃", "晚餐"]
    culture_stop = make_stop(make_destination("museum", "museum"), "2026-06-29T18:00:00+08:00", True)
    culture_stop["destination"].tags = ["文化", "室内"]

    food_schedule = make_schedule([food_stop])
    culture_schedule = make_schedule([culture_stop])

    assert score_traveler_style([food_stop], food_schedule, "food") > score_traveler_style(
        [culture_stop],
        culture_schedule,
        "food",
    )


def test_meal_score_rewards_food_stop_during_dinner_window():
    food_stop = make_stop(make_destination("snack_street", "shopping"), "2026-06-29T18:10:00+08:00", True)
    museum_stop = make_stop(make_destination("museum", "museum"), "2026-06-29T18:10:00+08:00", True)

    assert score_meal_fit(make_schedule([food_stop]), "food") > score_meal_fit(make_schedule([museum_stop]), "food")


def test_crowd_and_risk_penalizes_high_risk_family_route():
    risky_stop = make_stop(make_destination("popular_landmark", "night_view", risk_level="high"), "2026-06-29T19:00:00+08:00", True)
    calm_stop = make_stop(make_destination("quiet_museum", "museum", risk_level="low"), "2026-06-29T15:00:00+08:00", True)

    assert score_crowd_and_risk(make_schedule([risky_stop]), "family") < score_crowd_and_risk(
        make_schedule([calm_stop]),
        "family",
    )


def test_weather_fit_penalizes_outdoor_heavy_route_in_bad_weather():
    rain = WeatherSnapshot(source="amap", city="上海", weather="大雨", outdoor_risk="high")
    outdoor_stop = make_stop(make_destination("bund", "night_view"), "2026-06-29T15:00:00+08:00", True)
    indoor_stop = make_stop(make_destination("museum", "museum"), "2026-06-29T15:00:00+08:00", True)

    outdoor_schedule = make_schedule([outdoor_stop], travel_minutes=20, visit_minutes=90)
    indoor_schedule = make_schedule([indoor_stop], travel_minutes=20, visit_minutes=90)

    assert score_weather_fit(indoor_schedule, rain, "family") > score_weather_fit(outdoor_schedule, rain, "family") + 8


def test_route_candidate_score_includes_weather_fit():
    trip = make_trip()
    trip.traveler_style = "family"
    rain = WeatherSnapshot(source="amap", city="上海", weather="大雨", outdoor_risk="high")
    outdoor_stop = make_stop(make_destination("citywalk", "citywalk"), "2026-06-29T15:00:00+08:00", True)
    indoor_stop = make_stop(make_destination("museum", "museum"), "2026-06-29T15:00:00+08:00", True)

    outdoor_schedule = make_schedule([outdoor_stop], travel_minutes=20, visit_minutes=90)
    indoor_schedule = make_schedule([indoor_stop], travel_minutes=20, visit_minutes=90)

    assert score_route_candidate(indoor_schedule, trip, 360, rain) > score_route_candidate(
        outdoor_schedule,
        trip,
        360,
        rain,
    )


def test_long_move_penalty_targets_optional_points():
    first = make_destination("must_keep", "museum")
    second = make_destination("far_optional", "landmark")
    first.must_go = True
    optional_schedule = make_schedule(
        [
            make_stop(first, "2026-06-29T15:00:00+08:00", True),
            make_stop(second, "2026-06-29T17:00:00+08:00", True),
        ],
        travel_minutes=95,
        visit_minutes=120,
    )
    optional_schedule["legs"][1].duration_minutes = 72
    optional_schedule["legs"][1].distance_meters = 22_000

    first_must = make_destination("must_keep", "museum")
    second_must = make_destination("far_optional", "landmark")
    first_must.must_go = True
    second_must.must_go = True
    must_go_schedule = make_schedule(
        [
            make_stop(first_must, "2026-06-29T15:00:00+08:00", True),
            make_stop(second_must, "2026-06-29T17:00:00+08:00", True),
        ],
        travel_minutes=95,
        visit_minutes=120,
    )
    must_go_schedule["legs"][1].duration_minutes = 72
    must_go_schedule["legs"][1].distance_meters = 22_000

    assert score_long_optional_moves(optional_schedule) < score_long_optional_moves(must_go_schedule) - 15


def test_city_strategy_is_capped_as_auxiliary_signal():
    museum = make_stop(make_destination("forbidden_city", "museum"), "2026-06-29T15:00:00+08:00", True)
    historic = make_stop(make_destination("city_wall", "historic"), "2026-06-29T16:20:00+08:00", True)
    schedule = make_schedule([museum, historic])

    assert city_strategy_score(schedule["stops"], "北京", "photo") <= 2
    assert city_strategy_score(schedule["stops"], "北京", "classic") <= 3


def test_user_style_remains_primary_over_city_strategy():
    food_stop = make_stop(make_destination("snack_street", "shopping"), "2026-06-29T18:00:00+08:00", True)
    food_stop["destination"].tags = ["小吃", "美食"]
    food_schedule = make_schedule([food_stop])

    assert score_traveler_style([food_stop], food_schedule, "food") > city_strategy_score(
        food_schedule["stops"],
        "北京",
        "food",
    )
    assert "美食玩法优先" in city_strategy_decision_note("北京", "food")
    assert "只作为提醒" in city_strategy_decision_note("北京", "food")

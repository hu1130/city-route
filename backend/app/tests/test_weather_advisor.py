from datetime import datetime

from app.schemas.route import WeatherSnapshot
from app.schemas.trip import Location, TripDestination, TripRecord
from app.services.weather_advisor import build_weather_alerts, outdoor_risk_level, weather_context


def make_trip(traveler_style: str = "family") -> TripRecord:
    return TripRecord(
        id=1,
        city="上海",
        start_location=Location(name="人民广场", lat=31.2304, lng=121.4737),
        start_time=datetime.fromisoformat("2026-06-29T15:00:00+08:00"),
        end_time=datetime.fromisoformat("2026-06-29T21:00:00+08:00"),
        transport_preference="metro",
        pace="balanced",
        traveler_style=traveler_style,
        destinations=[],
    )


def destination(name: str, poi_type: str, tags: list[str]) -> TripDestination:
    return TripDestination(
        source_poi_id=name,
        raw_name=name,
        name=name,
        address=name,
        lat=31.23,
        lng=121.48,
        poi_type=poi_type,
        suggested_stay_minutes=60,
        risk_level="low",
        tags=tags,
        note="test",
    )


def test_weather_alerts_raise_risk_for_hot_rainy_outdoor_route():
    trip = make_trip("family")
    context = weather_context(
        [
            destination("外滩", "night_view", ["夜景", "拍照"]),
            destination("武康路", "citywalk", ["街区"]),
            destination("南京路步行街", "shopping", ["步行街"]),
        ]
    )
    weather = WeatherSnapshot(
        source="amap",
        city="上海",
        weather="大雨",
        temperature="36",
        wind="东南风 4级",
    )

    alerts = build_weather_alerts(weather, trip, context)

    assert outdoor_risk_level(weather, trip, context) == "high"
    assert any("室外" in alert for alert in alerts)
    assert any("高温" in alert for alert in alerts)


def test_weather_context_detects_indoor_destinations():
    context = weather_context(
        [
            destination("上海博物馆", "museum", ["室内", "文化"]),
            destination("外滩", "night_view", ["夜景"]),
        ]
    )

    assert context.indoor_count == 1
    assert context.outdoor_count == 1

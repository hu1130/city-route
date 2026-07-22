from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.schemas.route import WeatherSnapshot
from app.schemas.trip import TripDestination, TripRecord
from app.services.amap_client import AmapClient, AmapClientError


BAD_WEATHER_KEYWORDS = ["雨", "雪", "雷", "暴", "台风", "冰雹", "雾", "霾", "沙尘"]
STRONG_BAD_WEATHER_KEYWORDS = ["大雨", "暴雨", "雷", "台风", "冰雹", "暴雪"]
INDOOR_KEYWORDS = ["室内", "博物馆", "展馆", "美术馆", "商场", "购物", "餐饮", "饭店", "咖啡", "书店"]
OUTDOOR_KEYWORDS = ["夜景", "街区", "citywalk", "步行街", "公园", "景区", "风景", "地标", "外滩", "道路"]


@dataclass(frozen=True)
class WeatherContext:
    outdoor_count: int
    indoor_count: int
    total_count: int


class WeatherAdvisor:
    def __init__(self, city: str) -> None:
        self.city = city
        self.settings = get_settings()
        self.client = AmapClient()
        self._base_weather: WeatherSnapshot | None = None

    def build(self, trip: TripRecord, schedule: dict) -> WeatherSnapshot:
        base = self._get_base_weather()
        context = weather_context([stop["destination"] for stop in schedule["stops"]])
        alerts = build_weather_alerts(base, trip, context)
        return base.model_copy(
            update={
                "outdoor_risk": outdoor_risk_level(base, trip, context),
                "alerts": alerts,
            }
        )

    def _get_base_weather(self) -> WeatherSnapshot:
        if self._base_weather is not None:
            return self._base_weather

        if self.settings.amap_enabled:
            try:
                weather = self.client.get_live_weather(self.city)
                if weather is not None:
                    self._base_weather = weather
                    return weather
            except (AmapClientError, httpx.HTTPError, ValueError):
                pass

        self._base_weather = WeatherSnapshot(
            source="rule",
            city=self.city,
            weather="待确认",
            outdoor_risk="low",
            alerts=["未接入实时天气结果，出发前请在高德或天气 App 再确认。"],
        )
        return self._base_weather


def build_weather_alerts(weather: WeatherSnapshot, trip: TripRecord, context: WeatherContext) -> list[str]:
    alerts: list[str] = []
    weather_text = weather.weather
    temperature = parse_temperature(weather.temperature)
    outdoor_heavy = context.outdoor_count >= max(1, context.indoor_count + 1)

    if weather.source == "rule":
        alerts.append("未接入实时天气结果，出发前请在高德或天气 App 再确认。")

    if contains_any(weather_text, STRONG_BAD_WEATHER_KEYWORDS):
        alerts.append("当前天气可能明显影响室外游玩，优先保留室内点，室外点建议缩短停留。")
    elif contains_any(weather_text, BAD_WEATHER_KEYWORDS):
        alerts.append("天气可能影响拍照和步行，室外点建议准备雨具或备选室内点。")

    if temperature is not None:
        if temperature >= 35:
            alerts.append("高温风险较高，减少暴晒路段，亲子和老人玩法建议增加室内休息。")
        elif temperature >= 32:
            alerts.append("天气偏热，建议补水并减少连续步行。")
        elif temperature <= 3:
            alerts.append("天气较冷，室外夜景和街区停留建议缩短。")

    if outdoor_heavy and context.total_count >= 2:
        alerts.append("这条路线室外点较多，遇到下雨、高温或大风时要准备替代方案。")

    if trip.traveler_style in {"family", "senior"} and (outdoor_heavy or contains_any(weather_text, BAD_WEATHER_KEYWORDS)):
        alerts.append("亲子或老人出行建议优先确认卫生间、休息区和室内避雨点。")

    if trip.traveler_style == "photo" and contains_any(weather_text, BAD_WEATHER_KEYWORDS):
        alerts.append("摄影玩法受天气影响较大，夜景和街区点建议看现场能见度再决定停留。")

    if not alerts:
        alerts.append("天气暂无明显风险，仍建议出发前确认最新预报和现场开放状态。")

    return unique_texts(alerts)[:4]


def outdoor_risk_level(weather: WeatherSnapshot, trip: TripRecord, context: WeatherContext) -> str:
    score = 0
    temperature = parse_temperature(weather.temperature)

    if contains_any(weather.weather, STRONG_BAD_WEATHER_KEYWORDS):
        score += 3
    elif contains_any(weather.weather, BAD_WEATHER_KEYWORDS):
        score += 2

    if temperature is not None:
        if temperature >= 35 or temperature <= 0:
            score += 2
        elif temperature >= 32 or temperature <= 3:
            score += 1

    if context.outdoor_count >= max(2, context.indoor_count + 1):
        score += 1
    if trip.traveler_style in {"family", "senior"} and context.outdoor_count > 0:
        score += 1

    if score >= 4:
        return "high"
    if score >= 2:
        return "medium"
    return "low"


def weather_context(destinations: list[TripDestination]) -> WeatherContext:
    indoor_count = sum(1 for destination in destinations if is_indoor_destination(destination))
    total_count = len(destinations)
    return WeatherContext(
        outdoor_count=max(0, total_count - indoor_count),
        indoor_count=indoor_count,
        total_count=total_count,
    )


def is_indoor_destination(destination: TripDestination) -> bool:
    text = destination_text(destination)
    if contains_any(text, INDOOR_KEYWORDS):
        return True
    if destination.poi_type in {"museum", "shopping"}:
        return True
    if contains_any(text, OUTDOOR_KEYWORDS):
        return False
    return False


def destination_text(destination: TripDestination) -> str:
    return " ".join(
        [
            destination.name,
            destination.poi_type,
            *(destination.tags or []),
        ]
    ).lower()


def parse_temperature(value: str) -> float | None:
    if not value:
        return None
    text = value.replace("℃", "").replace("°C", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def contains_any(value: str, keywords: list[str]) -> bool:
    text = value.lower()
    return any(keyword.lower() in text for keyword in keywords)


def unique_texts(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result

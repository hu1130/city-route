from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.route import RouteInsight, RouteStopInsight, WeatherSnapshot
from app.schemas.trip import TripDestination, TripRecord
from app.services.deepseek_client import DeepSeekClient, DeepSeekClientError


class RouteInsightProvider:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = DeepSeekClient() if self.settings.deepseek_enabled else None
        self.deepseek_failed = False

    def build(
        self,
        trip: TripRecord,
        title: str,
        order: list[TripDestination],
        schedule: dict[str, Any],
        weather: WeatherSnapshot,
    ) -> RouteInsight:
        fallback = build_fallback_insight(trip, title, order, schedule, weather)
        if self.client is None or self.deepseek_failed:
            return fallback

        try:
            raw = self.client.generate_json(build_messages(trip, title, order, schedule, weather))
            return normalize_insight(raw, fallback)
        except (DeepSeekClientError, httpx.HTTPError, json.JSONDecodeError, ValueError, KeyError):
            self.deepseek_failed = True
            return fallback


def build_route_insight(
    trip: TripRecord,
    title: str,
    order: list[TripDestination],
    schedule: dict[str, Any],
    weather: WeatherSnapshot,
) -> RouteInsight:
    return RouteInsightProvider().build(trip, title, order, schedule, weather)


def build_messages(
    trip: TripRecord,
    title: str,
    order: list[TripDestination],
    schedule: dict[str, Any],
    weather: WeatherSnapshot,
) -> list[dict[str, str]]:
    payload = {
        "city": trip.city,
        "date": trip.start_time.date().isoformat(),
        "startTime": _time_text(trip.start_time),
        "endTime": _time_text(schedule["end_time"]),
        "title": title,
        "transportPreference": trip.transport_preference,
        "pace": trip.pace,
        "travelerStyle": trip.traveler_style,
        "totalMinutes": schedule["total_minutes"],
        "travelMinutes": schedule["travel_minutes"],
        "visitMinutes": schedule["visit_minutes"],
        "weather": weather.model_dump(by_alias=True),
        "stops": [
            {
                "destinationId": stop["destination"].source_poi_id,
                "name": stop["destination"].name,
                "arrivalTime": _time_text(stop["arrival_time"]),
                "departureTime": _time_text(stop["departure_time"]),
                "stayMinutes": stop["stay_minutes"],
                "poiType": stop["destination"].poi_type,
                "riskLevel": stop["destination"].risk_level,
                "tags": stop["destination"].tags,
                "knownNote": stop["destination"].note,
                "practicalInfo": stop["destination"].practical_info.model_dump(by_alias=True),
            }
            for stop in schedule["stops"]
        ],
        "legs": [
            {
                "from": leg.from_name,
                "to": leg.to_name,
                "transportMode": leg.transport_mode,
                "durationMinutes": leg.duration_minutes,
                "source": leg.source,
            }
            for leg in schedule["legs"]
        ],
    }
    return [
        {
            "role": "system",
            "content": (
                "你是城市即时旅行路线产品里的行程解释助手。"
                "只基于用户传入的数据输出中文 JSON。"
                "不要编造实时营业状态、票价、临时闭馆、活动和排队时间。"
                "涉及营业时间、门票、闭馆风险时，只能提醒以景区官方、现场公告或购票平台为准。"
            ),
        },
        {
            "role": "user",
            "content": (
                "请输出严格 JSON 对象，字段为：summary、routeReason、reminders、stopInsights。"
                "stopInsights 每项字段为：destinationId、name、highlight、practicalNote、riskNote。"
                "reminders 2-4 条，stopInsights 必须覆盖每个 stops。"
                f"\n输入数据：{json.dumps(payload, ensure_ascii=False)}"
            ),
        },
    ]


def normalize_insight(raw: dict[str, Any], fallback: RouteInsight) -> RouteInsight:
    stop_by_id = {item.destination_id: item for item in fallback.stop_insights}
    stop_insights = []
    for item in raw.get("stopInsights", raw.get("stop_insights", [])):
        if not isinstance(item, dict):
            continue
        candidate = RouteStopInsight(
            destination_id=_text(item.get("destinationId") or item.get("destination_id")),
            name=_text(item.get("name")),
            highlight=_text(item.get("highlight")),
            practical_note=_text(item.get("practicalNote") or item.get("practical_note")),
            risk_note=_text(item.get("riskNote") or item.get("risk_note")),
        )
        if candidate.destination_id and candidate.name:
            stop_insights.append(candidate)

    merged_stop_insights = []
    for fallback_item in fallback.stop_insights:
        matched = next((item for item in stop_insights if item.destination_id == fallback_item.destination_id), None)
        merged_stop_insights.append(matched or stop_by_id[fallback_item.destination_id])

    insight = RouteInsight(
        source="deepseek",
        summary=_text(raw.get("summary")) or fallback.summary,
        route_reason=_text(raw.get("routeReason") or raw.get("route_reason")) or fallback.route_reason,
        reminders=[
            _text(item)
            for item in raw.get("reminders", [])
            if _text(item)
        ][:4]
        or fallback.reminders,
        stop_insights=merged_stop_insights,
    )
    return insight


def build_fallback_insight(
    trip: TripRecord,
    title: str,
    order: list[TripDestination],
    schedule: dict[str, Any],
    weather: WeatherSnapshot,
) -> RouteInsight:
    names = " -> ".join(destination.name for destination in order)
    source_text = "高德真实交通耗时" if any(leg.source == "amap" for leg in schedule["legs"]) else "本地估算交通耗时"
    style_text = traveler_style_text(trip.traveler_style)
    reminders = [
        *weather.alerts[:2],
        "营业时间、门票、临时闭馆和限流信息需要以景区官方、现场公告或购票平台为准。",
        "如果某个景点现场排队明显变长，优先缩短停留或跳过非必去点。",
        "出发前建议在高德导航里再次确认实时路况和换乘方案。",
    ]
    return RouteInsight(
        source="fallback",
        summary=f"{title}按 {names} 的顺序安排，预计总耗时 {schedule['total_minutes']} 分钟。",
        route_reason=f"当前排序综合了可用时间、地点距离、停留时长、{source_text}{style_text}。",
        reminders=unique_texts(reminders)[:5],
        stop_insights=[
            RouteStopInsight(
                destination_id=stop["destination"].source_poi_id,
                name=stop["destination"].name,
                highlight=f"建议停留 {stop['stay_minutes']} 分钟，按当前路线 { _time_text(stop['arrival_time']) } 到达。",
                practical_note=practical_note_text(stop["destination"]),
                risk_note=_risk_note(stop["destination"]),
            )
            for stop in schedule["stops"]
        ],
    )


def traveler_style_text(value: str) -> str:
    return {
        "family": "，并偏向亲子友好的低强度安排",
        "couple": "，并偏向夜景、拍照和晚餐氛围",
        "senior": "，并偏向低强度和文化类地点",
        "photo": "，并偏向夜景、地标和街区拍照",
        "food": "，并偏向小吃、晚餐和商圈",
        "intense": "，并偏向多覆盖地点的特种兵节奏",
    }.get(value, "")


def practical_note_text(destination: TripDestination) -> str:
    info = destination.practical_info
    base = destination.note or "到达后先确认入口、开放区域和现场排队情况。"
    return (
        f"{base} 营业时间：{info.opening_hours}；门票：{info.ticket}；"
        f"闭馆状态：{info.closure_status}。"
    )


def _risk_note(destination: TripDestination) -> str:
    if destination.risk_level == "high":
        return "风险偏高，建议提前确认开放状态、预约要求和当天限流。"
    if destination.risk_level == "medium":
        return "存在一定不确定性，建议到达前确认营业时间、门票和临时闭馆信息。"
    return "常规风险，仍建议现场确认营业时间和票务信息。"


def _time_text(value: datetime) -> str:
    return value.strftime("%H:%M")


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def unique_texts(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result

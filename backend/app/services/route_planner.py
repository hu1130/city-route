from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import combinations, permutations
from math import atan2, cos, radians, sin, sqrt

import httpx

from app.schemas.route import RouteLeg, RoutePlan, RouteStop, WeatherSnapshot
from app.schemas.trip import Location, TripDestination, TripRecord
from app.core.config import get_settings
from app.services.amap_client import AmapClient, AmapClientError
from app.services.city_strategy import city_strategy_decision_note, city_strategy_factor, city_strategy_quality_note
from app.services.mock_data import BEST_TIME
from app.services.navigation_link import build_navigation_url
from app.services.route_scoring import is_indoor_destination, normalize_traveler_style, score_route_candidate
from app.services.trip_insights import RouteInsightProvider
from app.services.weather_advisor import WeatherAdvisor
from app.storage.memory_store import next_plan_id, save_plan


@dataclass(frozen=True)
class TransportProfile:
    label: str
    mode: str
    speed_kmh: float
    buffer_minutes: int
    walking_factor: float


@dataclass(frozen=True)
class PaceProfile:
    stay_factor: float
    buffer_factor: float


TRANSPORTS = {
    "metro": TransportProfile("地铁优先", "integrated", 24, 10, 1.1),
    "taxi": TransportProfile("打车优先", "car", 28, 8, 0.55),
    "walk": TransportProfile("步行优先", "walk", 4.5, 4, 2.4),
}

PACES = {
    "relaxed": PaceProfile(1.05, 1.25),
    "balanced": PaceProfile(1.0, 1.0),
    "compact": PaceProfile(0.78, 0.78),
}


def apply_traveler_style_to_pace(pace: PaceProfile, traveler_style: str) -> PaceProfile:
    style = normalize_traveler_style(traveler_style)
    multipliers = {
        "family": (1.08, 1.18),
        "senior": (1.12, 1.28),
        "couple": (1.04, 1.05),
        "photo": (1.12, 1.03),
        "food": (1.1, 1.08),
        "intense": (0.86, 0.82),
    }.get(style, (1.0, 1.0))
    return PaceProfile(
        stay_factor=pace.stay_factor * multipliers[0],
        buffer_factor=pace.buffer_factor * multipliers[1],
    )


def stay_minutes_for_destination(destination: TripDestination, pace: PaceProfile, traveler_style: str) -> int:
    if destination.stay_minutes is not None:
        return destination.stay_minutes

    style = normalize_traveler_style(traveler_style)
    factor = pace.stay_factor
    if style == "food" and destination.poi_type in {"shopping", "historic", "citywalk"}:
        factor *= 1.08
    elif style == "photo" and destination.poi_type in {"night_view", "historic", "citywalk"}:
        factor *= 1.1
    elif style == "family" and destination.poi_type in {"museum", "park"}:
        factor *= 1.06
    elif style == "senior" and destination.risk_level == "high":
        factor *= 0.88

    return max(25, round(destination.suggested_stay_minutes * factor))


def generate_route_plans(trip: TripRecord, fixed_order: bool = False) -> list[RoutePlan]:
    transport = TRANSPORTS.get(trip.transport_preference, TRANSPORTS["metro"])
    pace = apply_traveler_style_to_pace(PACES.get(trip.pace, PACES["balanced"]), trip.traveler_style)
    directions = DirectionProvider(trip.city)
    insights = RouteInsightProvider()
    weather_advisor = WeatherAdvisor(trip.city)
    budget = minutes_between(trip.start_time, trip.end_time)
    titles = [("推荐路线", "recommended"), ("轻松路线", "relaxed"), ("紧凑路线", "compact")]

    if fixed_order:
        order = list(trip.destinations)
        schedule = build_schedule(trip, order, transport, pace, directions)
        weather = weather_advisor.build(trip, schedule)
        score = score_route_candidate(schedule, trip, budget, weather)
        title, style = titles[0]
        return [save_plan(to_route_plan(trip, order, schedule, score, title, style, insights, weather))]

    scored: list[tuple[list[TripDestination], dict, float]] = []

    for subset in destination_subsets(trip.destinations, trip.traveler_style, trip.pace):
        for order_tuple in permutations(subset):
            order = list(order_tuple)
            schedule = build_schedule(trip, order, transport, pace, directions)
            weather = weather_advisor.build(trip, schedule)
            score = score_route_candidate(schedule, trip, budget, weather)
            if schedule["total_minutes"] <= budget * 1.12:
                scored.append((order, schedule, score))

    if not scored:
        for order_tuple in permutations(trip.destinations):
            order = list(order_tuple)
            schedule = build_schedule(trip, order, transport, pace, directions)
            weather = weather_advisor.build(trip, schedule)
            score = score_route_candidate(schedule, trip, budget, weather)
            scored.append((order, schedule, score))

    scored.sort(key=lambda item: item[2], reverse=True)
    selected = choose_distinct_candidates(scored, budget)
    plans: list[RoutePlan] = []
    for index, candidate in enumerate(selected[:3]):
        title, style = titles[index]
        weather = weather_advisor.build(trip, candidate[1])
        plan = to_route_plan(trip, candidate[0], candidate[1], candidate[2], title, style, insights, weather)
        plans.append(save_plan(plan))

    return plans


def destination_subsets(
    destinations: list[TripDestination],
    traveler_style: str = "classic",
    pace: str = "balanced",
) -> list[list[TripDestination]]:
    result: list[list[TripDestination]] = []
    must_go = [destination for destination in destinations if destination.must_go]
    optional = [destination for destination in destinations if not destination.must_go]
    minimum = 2 if len(destinations) > 2 else len(destinations)
    style = normalize_traveler_style(traveler_style)
    if style == "intense" or pace == "compact":
        minimum = max(minimum, min(len(destinations), max(len(must_go), len(destinations) - 1)))

    maximum = len(destinations)
    if style in {"family", "senior"} or pace == "relaxed":
        maximum = min(maximum, max(minimum, len(must_go), 4))

    for size in range(max(minimum, len(must_go)), maximum + 1):
        optional_count = size - len(must_go)
        if optional_count < 0 or optional_count > len(optional):
            continue
        result.extend([[*must_go, *item] for item in combinations(optional, optional_count)])
    return result


def choose_distinct_candidates(scored: list[tuple[list[TripDestination], dict, float]], budget: int) -> list[tuple]:
    recommended = choose_recommended(scored, budget)
    seen = {candidate_key(recommended)}

    relaxed_pool = [candidate for candidate in scored if candidate_key(candidate) not in seen] or scored
    relaxed = choose_relaxed(relaxed_pool, budget)
    seen.add(candidate_key(relaxed))

    compact_pool = [candidate for candidate in scored if candidate[1]["total_minutes"] <= budget] or scored
    compact = choose_compact(compact_pool)
    if candidate_key(compact) in seen:
        compact_stop_count = len(compact[1]["stops"])
        compact_alternatives = [
            candidate
            for candidate in compact_pool
            if candidate_key(candidate) not in seen and len(candidate[1]["stops"]) == compact_stop_count
        ]
        if compact_alternatives:
            compact = choose_compact(compact_alternatives)

    return [recommended, relaxed, compact]


def candidate_key(candidate: tuple[list[TripDestination], dict, float]) -> str:
    return ">".join(destination.source_poi_id for destination in candidate[0])


def choose_recommended(scored: list[tuple], budget: int) -> tuple:
    candidates = [item for item in scored if item[1]["total_minutes"] <= budget] or scored
    maximum_stops = max(len(item[1]["stops"]) for item in candidates)
    maximum_coverage = [item for item in candidates if len(item[1]["stops"]) == maximum_stops]
    return max(maximum_coverage, key=lambda item: item[2])


def choose_relaxed(scored: list[tuple], budget: int) -> tuple:
    candidates = [item for item in scored if item[1]["total_minutes"] <= budget * 0.9] or scored
    return sorted(
        candidates,
        key=lambda item: item[1]["walking_load"] + item[1]["travel_minutes"] * 0.12 + len(item[1]["stops"]) * 1.8,
    )[0]


def choose_compact(scored: list[tuple]) -> tuple:
    return sorted(scored, key=lambda item: (len(item[1]["stops"]), item[2]), reverse=True)[0]


def build_schedule(
    trip: TripRecord,
    order: list[TripDestination],
    transport: TransportProfile,
    pace: PaceProfile,
    directions: "DirectionProvider",
) -> dict:
    current: Location | TripDestination = trip.start_location
    clock = trip.start_time
    travel_minutes = 0
    visit_minutes = 0
    walking_load = 0.0
    stops = []
    legs = []

    for destination in order:
        leg = directions.build_leg(current, destination, transport, pace)
        clock += timedelta(minutes=leg.duration_minutes)
        travel_minutes += leg.duration_minutes
        walking_load += leg.distance_meters / 1000 * transport.walking_factor
        legs.append(leg)

        arrival = clock
        stay_minutes = stay_minutes_for_destination(destination, pace, trip.traveler_style)
        clock += timedelta(minutes=stay_minutes)
        visit_minutes += stay_minutes

        stops.append(
            {
                "destination": destination,
                "arrival_time": arrival,
                "departure_time": clock,
                "stay_minutes": stay_minutes,
                "time_match": time_bucket(arrival) in BEST_TIME.get(destination.poi_type, set()),
            }
        )
        current = destination

    return {
        "stops": stops,
        "legs": legs,
        "total_minutes": travel_minutes + visit_minutes,
        "travel_minutes": travel_minutes,
        "visit_minutes": visit_minutes,
        "walking_load": walking_load,
        "risk_level": route_risk(order),
        "end_time": clock,
    }


class DirectionProvider:
    def __init__(self, city: str) -> None:
        self.city = city
        self.settings = get_settings()
        self.client = AmapClient()
        self.cache: dict[tuple[str, str], RouteLeg] = {}

    def build_leg(
        self,
        origin: Location | TripDestination,
        destination: TripDestination,
        transport: TransportProfile,
        pace: PaceProfile,
    ) -> RouteLeg:
        cache_key = (transport.mode, f"{origin.lng},{origin.lat}>{destination.lng},{destination.lat}")
        if cache_key in self.cache:
            return self.cache[cache_key]

        navigation_url = build_navigation_url(origin, destination, transport.mode)
        leg = None
        if self.settings.amap_enabled:
            leg = self.build_amap_leg(origin, destination, transport)

        if leg is None:
            leg = build_estimated_leg(origin, destination, transport, pace, navigation_url)

        self.cache[cache_key] = leg
        return leg

    def build_amap_leg(
        self,
        origin: Location | TripDestination,
        destination: TripDestination,
        transport: TransportProfile,
    ) -> RouteLeg | None:
        for mode, label in amap_mode_fallbacks(transport):
            try:
                return self.client.build_direction_leg(
                    city=self.city,
                    origin=origin,
                    destination=destination,
                    transport_label=label,
                    mode=mode,
                    navigation_url=build_navigation_url(origin, destination, mode),
                )
            except (AmapClientError, httpx.HTTPError, ValueError):
                continue
        return None


def amap_mode_fallbacks(transport: TransportProfile) -> list[tuple[str, str]]:
    labels = {
        "integrated": "地铁优先",
        "car": "打车优先",
        "walk": "步行优先",
    }
    fallback_modes = {
        "integrated": ["integrated", "car", "walk"],
        "car": ["car", "walk"],
        "walk": ["walk", "car"],
    }.get(transport.mode, [transport.mode])

    result: list[tuple[str, str]] = []
    for mode in fallback_modes:
        label = transport.label if mode == transport.mode else labels.get(mode, transport.label)
        result.append((mode, label))
    return result


def build_estimated_leg(
    origin: Location | TripDestination,
    destination: TripDestination,
    transport: TransportProfile,
    pace: PaceProfile,
    navigation_url: str | None = None,
) -> RouteLeg:
    distance_km = haversine_km(origin.lat, origin.lng, destination.lat, destination.lng)
    raw_minutes = distance_km / transport.speed_kmh * 60
    duration = max(6, round(raw_minutes + transport.buffer_minutes * pace.buffer_factor))
    distance_meters = round(distance_km * 1000)
    return RouteLeg(
        from_name=origin.name,
        to_name=destination.name,
        transport_mode=transport.label,
        duration_minutes=duration,
        distance_meters=distance_meters,
        navigation_url=navigation_url or build_navigation_url(origin, destination, transport.mode),
        source="estimated",
    )


def to_route_plan(
    trip: TripRecord,
    order: list[TripDestination],
    schedule: dict,
    score: float,
    title: str,
    style: str,
    insights: RouteInsightProvider,
    weather: WeatherSnapshot,
) -> RoutePlan:
    stops = [
        RouteStop(
            destination_id=stop["destination"].source_poi_id,
            name=stop["destination"].name,
            lat=stop["destination"].lat,
            lng=stop["destination"].lng,
            arrival_time=stop["arrival_time"],
            departure_time=stop["departure_time"],
            stay_minutes=stop["stay_minutes"],
            suggestion=stop["destination"].note or "建议按现场状态灵活调整停留时间。",
            risk_level=stop["destination"].risk_level,
            tags=stop["destination"].tags,
            practical_info=stop["destination"].practical_info,
        )
        for stop in schedule["stops"]
    ]

    return RoutePlan(
        plan_id=next_plan_id(),
        trip_id=trip.id,
        title=title,
        style=style,
        total_minutes=schedule["total_minutes"],
        travel_minutes=schedule["travel_minutes"],
        visit_minutes=schedule["visit_minutes"],
        walking_level=walking_level(schedule["walking_load"]),
        risk_level=schedule["risk_level"],
        score=score,
        estimated_end_time=schedule["end_time"],
        summary=summarize_plan(title, order),
        score_factors=build_score_factors(trip.city, order, schedule, style, trip.traveler_style, weather),
        quality_notes=build_quality_notes(order, schedule, style, trip.traveler_style, trip, weather),
        decision_notes=build_decision_notes(trip, order, schedule, style),
        weather=weather,
        stops=stops,
        legs=schedule["legs"],
        insight=insights.build(trip, title, order, schedule, weather),
    )


def summarize_plan(title: str, order: list[TripDestination]) -> str:
    names = " → ".join(destination.name for destination in order)
    if "轻松" in title:
        return f"这条路线减少点位和赶路压力，优先保证舒服走完：{names}。"
    if "紧凑" in title:
        return f"这条路线尽量多覆盖想去地点，整体节奏会更紧凑：{names}。"
    return f"综合时间、距离和游玩时段，推荐顺序为：{names}。"


def build_decision_notes(trip: TripRecord, order: list[TripDestination], schedule: dict, style: str) -> list[str]:
    notes: list[str] = []

    if style == "relaxed":
        notes.append("轻松路线：少赶路，优先走得完。")
    elif style == "compact":
        notes.append("紧凑路线：多覆盖，整体节奏更紧凑。")
    else:
        notes.append("按时间、距离、偏好排序。")

    notes.append(city_strategy_decision_note(trip.city, trip.traveler_style))
    if any(destination.must_go for destination in order):
        notes.append("保留你标记的必去地点；系统只调整顺序和提醒风险。")

    selected_ids = {destination.source_poi_id for destination in order}
    omitted = [destination for destination in trip.destinations if destination.source_poi_id not in selected_ids]
    normalized_style = normalize_traveler_style(trip.traveler_style)

    for destination in omitted[:3]:
        if destination.risk_level == "high":
            notes.append(f"{destination.name} 未排：风险高，先确认开放。")
        elif normalized_style in {"family", "senior"} or trip.pace == "relaxed":
            notes.append(f"{destination.name} 未排：降低强度，先排顺路点。")
        else:
            notes.append(f"{destination.name} 未排：时间不够，先排更顺路点。")

    adjusted_count = 0
    for stop in schedule["stops"]:
        destination = stop["destination"]
        actual_minutes = stop["stay_minutes"]
        if destination.stay_minutes is not None:
            notes.append(f"{destination.name} 保留 {actual_minutes} 分钟。")
            adjusted_count += 1
        elif actual_minutes != destination.suggested_stay_minutes:
            notes.append(f"{destination.name} 停留 {destination.suggested_stay_minutes}->{actual_minutes} 分钟。")
            adjusted_count += 1

        if adjusted_count >= 2:
            break

    return unique_texts(notes)[:4]


def build_score_factors(
    city: str,
    order: list[TripDestination],
    schedule: dict,
    style: str,
    traveler_style: str,
    weather: WeatherSnapshot,
) -> list[str]:
    factors: list[str] = []
    normalized_style = normalize_traveler_style(traveler_style)

    if any(leg.source == "amap" for leg in schedule["legs"]):
        factors.append("高德真实交通耗时")
    else:
        factors.append("本地估算交通耗时")

    travel_ratio = schedule["travel_minutes"] / max(1, schedule["total_minutes"])
    if travel_ratio <= 0.3:
        factors.append("交通占比低")
    elif travel_ratio >= 0.42:
        factors.append("交通占比较高")

    style_factor = traveler_style_factor_text(normalized_style)
    if style_factor:
        factors.append(style_factor)

    factors.append(city_strategy_factor(city, normalized_style))

    if style == "relaxed":
        factors.append("减少赶路压力")
    elif style == "compact":
        factors.append("优先多点覆盖")

    if meal_friendly_during_window(schedule, 11.5, 13.25):
        factors.append("午饭附近有用餐点")
    elif schedule_overlaps_hour_window(schedule, 11.5, 13.25):
        factors.append("午饭可能被占用")

    if meal_friendly_during_window(schedule, 18.0, 19.5):
        factors.append("晚饭附近有用餐点")
    elif schedule_overlaps_hour_window(schedule, 18.0, 19.5):
        factors.append("晚饭可能被占用")

    indoor_count, outdoor_count = indoor_outdoor_counts(schedule)
    if weather.outdoor_risk == "high":
        if indoor_count > 0:
            factors.append("天气风险高，室内点加权")
        else:
            factors.append("天气风险高")
    elif weather.outdoor_risk == "medium":
        if indoor_count >= outdoor_count and indoor_count > 0:
            factors.append("天气不稳，保留室内点")
        else:
            factors.append("天气影响室外体验")

    if schedule["risk_level"] == "high":
        factors.append("高风险点需确认")
    elif schedule["risk_level"] == "medium":
        factors.append("部分点需确认")

    if any(is_popular_or_queue_prone(destination) for destination in order):
        factors.append("热门点注意排队")

    longest_entry = longest_route_leg_entry(schedule)
    longest_leg = longest_entry[1] if longest_entry else None
    if longest_leg and (longest_leg.duration_minutes >= 55 or longest_leg.distance_meters >= 15_000):
        if long_route_leg_has_optional_endpoint(schedule, longest_entry[0]):
            factors.append("远距离可选点已降权")
        else:
            factors.append("必去点较远，保留提醒")

    return unique_texts(factors)[:5]


def traveler_style_factor_text(style: str) -> str:
    return {
        "family": "亲子优先低强度、室内和休息缓冲",
        "couple": "情侣偏好夜景、拍照和晚餐氛围",
        "senior": "老人优先低强度、文化点和短移动",
        "photo": "摄影优先夜景、地标和街区光线",
        "food": "美食优先小吃、晚餐和商圈",
        "intense": "特种兵优先多点覆盖和打卡效率",
    }.get(style, "")


def meal_friendly_during_window(schedule: dict, start_hour: float, end_hour: float) -> bool:
    return any(
        overlaps_hour_window(stop["arrival_time"], stop["departure_time"], start_hour, end_hour)
        and is_meal_friendly(stop["destination"])
        for stop in schedule["stops"]
    )


def schedule_overlaps_hour_window(schedule: dict, start_hour: float, end_hour: float) -> bool:
    stop_windows = [(stop["arrival_time"], stop["departure_time"]) for stop in schedule["stops"]]
    leg_windows = []
    for index, leg in enumerate(schedule["legs"][: len(schedule["stops"])]):
        leg_end = schedule["stops"][index]["arrival_time"]
        leg_windows.append((leg_end - timedelta(minutes=leg.duration_minutes), leg_end))
    return any(overlaps_hour_window(start, end, start_hour, end_hour) for start, end in [*leg_windows, *stop_windows])


def overlaps_hour_window(start: datetime, end: datetime, start_hour: float, end_hour: float) -> bool:
    return hour_value(start) < end_hour and hour_value(end) > start_hour


def is_meal_friendly(destination: TripDestination) -> bool:
    return destination.poi_type in {"shopping", "historic"} or destination_has_text(
        destination,
        ["food", "restaurant", "snack", "dining", "mall", "小吃", "美食", "餐饮", "饭店", "商圈", "夜市"],
    )


def is_popular_or_queue_prone(destination: TripDestination) -> bool:
    popularity = getattr(destination.practical_info, "popularity", "")
    return destination.risk_level in {"medium", "high"} or destination_has_text(
        destination,
        ["hot", "popular", "landmark", "night_view", "热门", "地标", "网红", "夜景", "排队"],
    ) or any(token in str(popularity).lower() for token in ["hot", "popular", "高", "热门", "较高"])


def destination_has_text(destination: TripDestination, keywords: list[str]) -> bool:
    text = " ".join([destination.name, destination.poi_type, *(destination.tags or [])]).lower()
    return any(keyword.lower() in text for keyword in keywords)


def traveler_style_short_label(traveler_style: str) -> str:
    return {
        "family": "亲子玩法",
        "couple": "情侣玩法",
        "senior": "老人玩法",
        "photo": "摄影玩法",
        "food": "美食玩法",
        "intense": "高强度玩法",
    }.get(normalize_traveler_style(traveler_style), "经典玩法")


def build_quality_notes(
    order: list[TripDestination],
    schedule: dict,
    style: str,
    traveler_style: str = "classic",
    trip: TripRecord | None = None,
    weather: WeatherSnapshot | None = None,
) -> list[str]:
    notes: list[str] = []
    stops = schedule["stops"]
    legs = schedule["legs"]

    if trip:
        notes.extend(build_time_boundary_notes(schedule, trip))

    if weather:
        notes.extend(build_weather_quality_notes(schedule, weather))

    style_note = build_traveler_style_note(traveler_style)
    if style_note:
        notes.append(style_note)

    notes.extend(build_long_move_notes(schedule, trip))
    notes.extend(build_meal_notes(schedule))

    city_note = city_strategy_quality_note(trip.city) if trip else ""
    if city_note:
        notes.append(city_note)

    if style == "relaxed":
        notes.append("减少点位和赶路压力")
    elif style == "compact":
        notes.append("尽量覆盖更多想去地点")

    if any(
        stop["destination"].poi_type == "night_view" and hour_value(stop["arrival_time"]) >= 18
        for stop in stops
    ):
        notes.append("夜景点安排在傍晚后")

    if any(
        stop["destination"].poi_type == "museum" and hour_value(stop["arrival_time"]) < 16
        for stop in stops
    ):
        notes.append("展馆类地点避开太晚到达")

    travel_ratio = schedule["travel_minutes"] / max(1, schedule["total_minutes"])
    if travel_ratio <= 0.28:
        notes.append("游玩时间占比更高")
    elif travel_ratio >= 0.42:
        notes.append("交通占比较高，适合接受紧凑节奏")

    if legs and max(leg.duration_minutes for leg in legs) <= 25:
        notes.append("单段移动时间较短")

    if schedule["risk_level"] == "high":
        notes.append("含高风险地点，出发前必须确认开放状态")
    elif schedule["risk_level"] == "medium":
        notes.append("含需确认开放状态的地点")

    notes.extend(build_pace_notes(schedule))

    if not notes:
        notes.append("综合时间、距离和停留时长后得分较高")

    return unique_texts(notes)[:4]


def build_weather_quality_notes(schedule: dict, weather: WeatherSnapshot) -> list[str]:
    if weather.outdoor_risk == "low":
        return []

    indoor_count, outdoor_count = indoor_outdoor_counts(schedule)
    if weather.outdoor_risk == "high":
        if indoor_count > 0 and indoor_count >= outdoor_count:
            return ["天气差，优先保留室内点"]
        if outdoor_count > 0:
            return ["天气差，室外点缩短停留"]
    if weather.outdoor_risk == "medium":
        if indoor_count > 0 and indoor_count >= outdoor_count:
            return ["天气不稳，保留室内缓冲"]
        if outdoor_count > indoor_count:
            return ["天气影响室外，准备备选点"]
    return []


def indoor_outdoor_counts(schedule: dict) -> tuple[int, int]:
    indoor_count = sum(1 for stop in schedule["stops"] if is_indoor_destination(stop["destination"]))
    outdoor_count = max(0, len(schedule["stops"]) - indoor_count)
    return indoor_count, outdoor_count


def build_traveler_style_note(traveler_style: str) -> str:
    return {
        "family": "亲子玩法：低强度优先",
        "couple": "情侣玩法：夜景和氛围优先",
        "senior": "老人玩法：少走路优先",
        "photo": "摄影玩法：地标和光线优先",
        "food": "美食玩法：饭点和商圈优先",
        "intense": "特种兵玩法：多点覆盖优先",
    }.get(normalize_traveler_style(traveler_style), "")


def build_time_boundary_notes(schedule: dict, trip: TripRecord) -> list[str]:
    notes: list[str] = []
    overtime_minutes = round((schedule["end_time"] - trip.end_time).total_seconds() / 60)
    remaining_minutes = round((trip.end_time - schedule["end_time"]).total_seconds() / 60)

    if overtime_minutes > 0:
        notes.append(f"预计超时 {overtime_minutes} 分钟，建议删可选点")
    elif remaining_minutes >= 45:
        notes.append(f"留有约 {remaining_minutes} 分钟缓冲")

    if schedule["total_minutes"] >= minutes_between(trip.start_time, trip.end_time) * 0.95:
        notes.append("时间接近上限，不建议加点")

    return notes


def build_meal_notes(schedule: dict) -> list[str]:
    notes: list[str] = []
    occupied_windows = [(stop["arrival_time"], stop["departure_time"]) for stop in schedule["stops"]]
    occupied_windows.extend(leg_windows(schedule))

    if overlaps_any(occupied_windows, 11.5, 13.25):
        notes.append("午饭可能被占用，提前用餐")
    if overlaps_any(occupied_windows, 18.0, 19.5):
        notes.append("晚饭可能被占用，预留用餐")

    return notes


def leg_windows(schedule: dict) -> list[tuple[datetime, datetime]]:
    stops = schedule["stops"]
    legs = schedule["legs"]
    if not stops or not legs:
        return []

    windows: list[tuple[datetime, datetime]] = []
    for index, leg in enumerate(legs):
        leg_end = stops[index]["arrival_time"]
        windows.append((leg_end - timedelta(minutes=leg.duration_minutes), leg_end))
    return windows


def overlaps_any(windows: list[tuple[datetime, datetime]], start_hour: float, end_hour: float) -> bool:
    return any(hour_value(start) < end_hour and hour_value(end) > start_hour for start, end in windows)


def build_pace_notes(schedule: dict) -> list[str]:
    notes: list[str] = []
    stops = schedule["stops"]
    legs = schedule["legs"]

    if stops and schedule["total_minutes"] / max(1, len(stops)) < 70:
        notes.append("单点时间偏紧，适合打卡")

    if legs:
        longest_leg = max(leg.duration_minutes for leg in legs)
        if longest_leg >= 45:
            notes.append(f"最长移动约 {longest_leg} 分钟")

    return notes


def build_long_move_notes(schedule: dict, trip: TripRecord | None = None) -> list[str]:
    longest_entry = longest_route_leg_entry(schedule)
    if not longest_entry:
        return []

    index, longest_leg = longest_entry
    notes: list[str] = []
    if longest_leg.duration_minutes >= 65 or longest_leg.distance_meters >= 20_000:
        if long_route_leg_has_optional_endpoint(schedule, index):
            notes.append(f"{longest_leg.from_name}到{longest_leg.to_name}约{longest_leg.duration_minutes}分钟，建议少排可选点")
        else:
            notes.append(f"{longest_leg.from_name}到{longest_leg.to_name}约{longest_leg.duration_minutes}分钟，必去点已保留")
    elif longest_leg.duration_minutes >= 50 or longest_leg.distance_meters >= 12_000:
        if long_route_leg_has_optional_endpoint(schedule, index):
            notes.append(f"{longest_leg.from_name}到{longest_leg.to_name}偏远，可删可选点")
        else:
            notes.append(f"{longest_leg.from_name}到{longest_leg.to_name}偏远，按必去保留")

    travel_ratio = schedule["travel_minutes"] / max(1, schedule["total_minutes"])
    if trip and travel_ratio >= 0.45 and trip.pace != "compact":
        notes.append("交通占比高，建议删可选点")

    return notes


def longest_route_leg(schedule: dict) -> RouteLeg | None:
    entry = longest_route_leg_entry(schedule)
    return entry[1] if entry else None


def longest_route_leg_entry(schedule: dict) -> tuple[int, RouteLeg] | None:
    legs = schedule.get("legs") or []
    if not legs:
        return None
    return max(enumerate(legs), key=lambda item: (item[1].duration_minutes, item[1].distance_meters))


def long_route_leg_has_optional_endpoint(schedule: dict, index: int) -> bool:
    stops = schedule.get("stops") or []
    if index >= len(stops):
        return False

    destination = stops[index]["destination"]
    previous = stops[index - 1]["destination"] if index > 0 else None
    return not destination.must_go or (previous is not None and not previous.must_go)


def unique_texts(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def route_risk(order: list[TripDestination]) -> str:
    if any(destination.risk_level == "high" for destination in order):
        return "high"
    if any(destination.risk_level == "medium" for destination in order):
        return "medium"
    return "low"


def walking_level(load: float) -> str:
    if load < 4:
        return "low"
    if load < 8:
        return "medium"
    return "high"


def hour_value(value: datetime) -> float:
    return value.hour + value.minute / 60


def time_bucket(value: datetime) -> str:
    hour = value.hour
    if hour < 11:
        return "morning"
    if hour < 17:
        return "afternoon"
    if hour < 20:
        return "evening"
    return "night"


def minutes_between(start: datetime, end: datetime) -> int:
    return round((end - start).total_seconds() / 60)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_km = 6371
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    r_lat1 = radians(lat1)
    r_lat2 = radians(lat2)
    value = sin(d_lat / 2) ** 2 + sin(d_lng / 2) ** 2 * cos(r_lat1) * cos(r_lat2)
    return earth_km * 2 * atan2(sqrt(value), sqrt(1 - value))

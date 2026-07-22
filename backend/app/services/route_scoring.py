from datetime import timedelta

from app.schemas.route import WeatherSnapshot
from app.schemas.trip import TripRecord
from app.services.city_strategy import city_strategy_score


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def risk_penalty(risk_level: str) -> int:
    return {"low": 0, "medium": 3, "high": 7}.get(risk_level, 0)


def score_preference(stop_count: int, travel_minutes: int, pace: str) -> float:
    if pace == "relaxed":
        return clamp(15 - stop_count * 1.2 - travel_minutes * 0.04, 0, 15)
    if pace == "compact":
        return clamp(7 + stop_count * 2, 0, 15)
    return clamp(10 + stop_count, 0, 15)


def normalize_traveler_style(value: str | None) -> str:
    allowed = {"classic", "family", "couple", "senior", "photo", "food", "intense"}
    return value if value in allowed else "classic"


def score_traveler_style(stops: list[dict], schedule: dict, traveler_style: str) -> float:
    style = normalize_traveler_style(traveler_style)
    if style == "classic" or not stops:
        return 0

    score = sum(score_destination_for_style(stop["destination"], style) for stop in stops)

    if style in {"family", "senior"}:
        score += clamp(8 - schedule["walking_load"] * 0.7, -6, 8)
        if schedule["risk_level"] == "high":
            score -= 6
        elif schedule["risk_level"] == "medium":
            score -= 2
    elif style == "intense":
        score += len(stops) * 2
        score += clamp(8 - schedule["travel_minutes"] * 0.025, 0, 8)

    return clamp(score, -8, 16)


def score_meal_fit(schedule: dict, traveler_style: str) -> float:
    style = normalize_traveler_style(traveler_style)
    score = 0.0
    for start_hour, end_hour, weight in [(11.5, 13.25, 3), (18.0, 19.5, 4)]:
        if not schedule_overlaps_window(schedule, start_hour, end_hour):
            continue
        if any_stop_matches_window(schedule["stops"], start_hour, end_hour, is_meal_friendly_destination):
            score += weight
        else:
            penalty = 6 if style in {"family", "senior", "food"} else 4
            score -= penalty
    return clamp(score, -10, 8)


def score_crowd_and_risk(schedule: dict, traveler_style: str) -> float:
    style = normalize_traveler_style(traveler_style)
    score = 0.0
    for stop in schedule["stops"]:
        destination = stop["destination"]
        arrival_hour = hour_value(stop["arrival_time"])
        if destination.risk_level == "high":
            score -= 9 if style in {"family", "senior"} else 6
        elif destination.risk_level == "medium":
            score -= 4 if style in {"family", "senior"} else 2

        if is_popular_destination(destination) and 11 <= arrival_hour <= 20:
            score -= 3
        if style in {"family", "senior"} and destination.poi_type in {"night_view", "citywalk"} and arrival_hour >= 20:
            score -= 3
    return clamp(score, -16, 4)


def score_weather_resilience(schedule: dict, traveler_style: str) -> float:
    style = normalize_traveler_style(traveler_style)
    indoor_count = sum(1 for stop in schedule["stops"] if is_indoor_destination(stop["destination"]))
    outdoor_count = max(0, len(schedule["stops"]) - indoor_count)
    if not schedule["stops"]:
        return 0
    if style in {"family", "senior"}:
        return clamp(indoor_count * 1.6 - outdoor_count * 1.2, -5, 5)
    if style == "photo":
        return clamp(outdoor_count * 1.2, 0, 5)
    return clamp(indoor_count * 0.6, 0, 3)


def score_weather_fit(schedule: dict, weather: WeatherSnapshot, traveler_style: str) -> float:
    if weather.source == "rule" or weather.outdoor_risk == "low" or not schedule["stops"]:
        return 0

    style = normalize_traveler_style(traveler_style)
    indoor_count = sum(1 for stop in schedule["stops"] if is_indoor_destination(stop["destination"]))
    outdoor_count = max(0, len(schedule["stops"]) - indoor_count)
    risk_weight = 1.75 if weather.outdoor_risk == "high" else 1.0

    score = indoor_count * 2.2 * risk_weight - outdoor_count * 2.8 * risk_weight
    if style in {"family", "senior"}:
        score -= outdoor_count * 1.4 * risk_weight
    elif style == "photo":
        score -= outdoor_count * 1.2 * risk_weight
    elif style == "intense":
        score *= 0.75

    return clamp(score, -20, 12)


def score_route_candidate(
    schedule: dict,
    trip: TripRecord,
    budget_minutes: int,
    weather: WeatherSnapshot | None = None,
) -> float:
    score = score_schedule(schedule, trip, budget_minutes)
    score += score_long_optional_moves(schedule)
    if weather is not None:
        score += score_weather_fit(schedule, weather, getattr(trip, "traveler_style", "classic"))
    return round(score, 2)


def score_long_optional_moves(schedule: dict) -> float:
    stops = schedule["stops"]
    penalty = 0.0

    for index, leg in enumerate(schedule["legs"][: len(stops)]):
        severity = long_move_severity(leg)
        if severity <= 0:
            continue

        destination = stops[index]["destination"]
        previous = stops[index - 1]["destination"] if index > 0 else None
        has_optional_endpoint = not destination.must_go or (previous is not None and not previous.must_go)

        if has_optional_endpoint:
            penalty -= severity * 1.25
        else:
            penalty -= min(severity * 0.25, 4)

    return clamp(penalty, -32, 0)


def long_move_severity(leg) -> float:
    severity = 0.0
    if leg.duration_minutes >= 50:
        severity += (leg.duration_minutes - 45) * 0.35
    if leg.distance_meters >= 12_000:
        severity += (leg.distance_meters / 1000 - 10) * 0.55
    if leg.duration_minutes >= 65 or leg.distance_meters >= 20_000:
        severity += 6
    return clamp(severity, 0, 24)


def score_destination_for_style(destination, traveler_style: str) -> float:
    text = " ".join(
        [
            destination.name,
            destination.poi_type,
            *(destination.tags or []),
        ]
    ).lower()

    weights = {
        "family": {
            "museum": 4,
            "park": 4,
            "室内": 3,
            "展馆": 3,
            "文化": 2,
            "休闲": 2,
            "高风险": -4,
            "夜游": -2,
        },
        "couple": {
            "night_view": 5,
            "夜景": 5,
            "citywalk": 4,
            "街区": 3,
            "晚餐": 4,
            "休闲": 3,
            "拍照": 2,
        },
        "senior": {
            "museum": 5,
            "historic": 4,
            "历史": 4,
            "文化": 3,
            "室内": 3,
            "休闲": 2,
            "夜游": -3,
            "步行街": -2,
        },
        "photo": {
            "night_view": 5,
            "夜景": 5,
            "拍照": 5,
            "地标": 4,
            "citywalk": 4,
            "街区": 3,
            "历史": 2,
        },
        "food": {
            "小吃": 6,
            "晚餐": 5,
            "shopping": 3,
            "商圈": 3,
            "休闲": 2,
            "夜游": 2,
        },
        "intense": {
            "地标": 3,
            "夜景": 2,
            "citywalk": 2,
            "shopping": 2,
            "历史": 2,
        },
    }.get(traveler_style, {})

    score = 0
    for keyword, value in weights.items():
        if keyword.lower() in text:
            score += value
    return clamp(score, -5, 8)


def hour_value(value) -> float:
    return value.hour + value.minute / 60


def score_stop_timing(stop: dict) -> float:
    destination = stop["destination"]
    arrival_hour = hour_value(stop["arrival_time"])
    poi_type = destination.poi_type
    score = 5 if stop["time_match"] else -3

    if poi_type == "night_view":
        if arrival_hour >= 18.5:
            score += 9
        elif arrival_hour >= 17:
            score += 3
        else:
            score -= 8
    elif poi_type == "museum":
        if arrival_hour >= 16:
            score -= 9
        elif arrival_hour >= 14.5:
            score -= 2
        else:
            score += 5
    elif poi_type == "shopping":
        if arrival_hour >= 17:
            score += 5
        elif arrival_hour < 11:
            score -= 2
    elif poi_type == "historic":
        if arrival_hour >= 20:
            score -= 4
        elif arrival_hour >= 15:
            score += 4
    elif poi_type == "citywalk":
        if 14 <= arrival_hour < 19:
            score += 4
        elif arrival_hour >= 20:
            score -= 2

    return clamp(score, -10, 14)


def score_timing(stops: list[dict]) -> float:
    if not stops:
        return 0
    return clamp(sum(score_stop_timing(stop) for stop in stops) + 8, 0, 24)


def score_comfort(schedule: dict) -> float:
    legs = schedule["legs"]
    travel_minutes = schedule["travel_minutes"]
    visit_minutes = schedule["visit_minutes"]
    walking_load = schedule["walking_load"]
    base = 14 - walking_load * 0.55

    if legs:
        longest_leg = max(leg.duration_minutes for leg in legs)
        average_leg = travel_minutes / len(legs)
        base -= max(0, longest_leg - average_leg * 1.7) * 0.2

    travel_ratio = travel_minutes / max(1, travel_minutes + visit_minutes)
    if travel_ratio > 0.38:
        base -= (travel_ratio - 0.38) * 35

    return clamp(base, 0, 14)


def score_schedule(schedule: dict, trip: TripRecord, budget_minutes: int) -> float:
    overtime = max(0, schedule["total_minutes"] - budget_minutes)
    unused = max(0, budget_minutes - schedule["total_minutes"])
    time_score = clamp(30 - overtime * 0.45 - max(0, unused - budget_minutes * 0.35) * 0.08, 0, 30)
    travel_score = clamp(20 - schedule["travel_minutes"] * 0.08, 0, 20)
    timing_score = score_timing(schedule["stops"])
    preference_score = score_preference(len(schedule["stops"]), schedule["travel_minutes"], trip.pace)
    traveler_style_score = score_traveler_style(
        schedule["stops"],
        schedule,
        getattr(trip, "traveler_style", "classic"),
    )
    meal_score = score_meal_fit(schedule, getattr(trip, "traveler_style", "classic"))
    risk_pressure_score = score_crowd_and_risk(schedule, getattr(trip, "traveler_style", "classic"))
    weather_resilience_score = score_weather_resilience(schedule, getattr(trip, "traveler_style", "classic"))
    city_score = city_strategy_score(
        schedule["stops"],
        getattr(trip, "city", ""),
        getattr(trip, "traveler_style", "classic"),
    )
    risk_score = clamp(10 - risk_penalty(schedule["risk_level"]), 0, 10)
    comfort_score = score_comfort(schedule)
    coverage_bonus = len(schedule["stops"]) * 2
    return round(
        time_score
        + travel_score
        + timing_score
        + preference_score
        + traveler_style_score
        + meal_score
        + risk_pressure_score
        + weather_resilience_score
        + city_score
        + risk_score
        + comfort_score
        + coverage_bonus,
        2,
    )


def schedule_overlaps_window(schedule: dict, start_hour: float, end_hour: float) -> bool:
    stop_windows = [(stop["arrival_time"], stop["departure_time"]) for stop in schedule["stops"]]
    return any(overlaps_window(start, end, start_hour, end_hour) for start, end in [*movement_windows(schedule), *stop_windows])


def any_stop_matches_window(stops: list[dict], start_hour: float, end_hour: float, matcher) -> bool:
    return any(
        overlaps_window(stop["arrival_time"], stop["departure_time"], start_hour, end_hour)
        and matcher(stop["destination"])
        for stop in stops
    )


def movement_windows(schedule: dict) -> list[tuple]:
    stops = schedule["stops"]
    legs = schedule["legs"]
    windows = []
    for index, leg in enumerate(legs[: len(stops)]):
        end = stops[index]["arrival_time"]
        windows.append((end - timedelta(minutes=leg.duration_minutes), end))
    return windows


def overlaps_window(start, end, start_hour: float, end_hour: float) -> bool:
    return hour_value(start) < end_hour and hour_value(end) > start_hour


def is_meal_friendly_destination(destination) -> bool:
    return destination.poi_type in {"shopping", "historic"} or contains_destination_text(
        destination,
        ["food", "restaurant", "snack", "dining", "mall", "小吃", "美食", "餐饮", "饭店", "商圈", "夜市"],
    )


def is_indoor_destination(destination) -> bool:
    return destination.poi_type in {"museum", "shopping"} or contains_destination_text(
        destination,
        [
            "indoor",
            "museum",
            "gallery",
            "mall",
            "bookstore",
            "restaurant",
            "cafe",
            "dining",
            "室内",
            "博物馆",
            "展馆",
            "美术馆",
            "商场",
            "书店",
            "餐饮",
            "饭店",
            "咖啡",
        ],
    )


def is_popular_destination(destination) -> bool:
    practical_info = getattr(destination, "practical_info", None)
    popularity = getattr(practical_info, "popularity", "") if practical_info else ""
    return contains_destination_text(
        destination,
        ["hot", "popular", "landmark", "night_view", "热门", "地标", "网红", "夜景", "排队"],
    ) or any(token in str(popularity).lower() for token in ["hot", "popular", "高", "热门", "较高"])


def contains_destination_text(destination, keywords: list[str]) -> bool:
    text = " ".join(
        [
            getattr(destination, "name", ""),
            getattr(destination, "poi_type", ""),
            *(getattr(destination, "tags", []) or []),
        ]
    ).lower()
    return any(keyword.lower() in text for keyword in keywords)

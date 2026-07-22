from __future__ import annotations

from dataclasses import dataclass

from app.schemas.trip import TripDestination


@dataclass(frozen=True)
class CityStrategy:
    key: str
    aliases: tuple[str, ...]
    cue: str
    match_keywords: tuple[str, ...]
    risk_keywords: tuple[str, ...]


CITY_STRATEGIES = [
    CityStrategy(
        key="北京",
        aliases=("北京", "北京市"),
        cue="预约、安检、闭馆和大客流风险更常见",
        match_keywords=("museum", "historic", "博物馆", "故宫", "历史", "文化", "公园"),
        risk_keywords=("museum", "博物馆", "展馆", "故宫", "热门", "预约"),
    ),
    CityStrategy(
        key="杭州",
        aliases=("杭州", "杭州市"),
        cue="户外、绕湖距离和天气影响更明显",
        match_keywords=("park", "citywalk", "西湖", "湖", "公园", "街区", "博物馆"),
        risk_keywords=("西湖", "湖", "公园", "citywalk", "步行", "户外"),
    ),
    CityStrategy(
        key="成都",
        aliases=("成都", "成都市"),
        cue="饭点、人流和美食街停留价值更高",
        match_keywords=("food", "shopping", "小吃", "美食", "古街", "商圈", "夜市"),
        risk_keywords=("热门", "小吃", "古街", "商圈", "排队"),
    ),
    CityStrategy(
        key="广州",
        aliases=("广州", "广州市"),
        cue="夜景、江边、换乘和高温天气更需要留意",
        match_keywords=("night_view", "citywalk", "广州塔", "夜景", "地标", "步行街", "商圈"),
        risk_keywords=("night_view", "夜景", "塔", "热门", "步行街", "户外"),
    ),
    CityStrategy(
        key="西安",
        aliases=("西安", "西安市"),
        cue="历史景点、博物馆预约和古城步行强度更需要提醒",
        match_keywords=("historic", "museum", "城墙", "历史", "博物馆", "古街", "文化"),
        risk_keywords=("museum", "博物馆", "城墙", "热门", "预约", "步行"),
    ),
    CityStrategy(
        key="上海",
        aliases=("上海", "上海市"),
        cue="商圈、夜景、人流和跨区移动更需要平衡",
        match_keywords=("night_view", "shopping", "citywalk", "夜景", "地标", "商圈", "街区"),
        risk_keywords=("night_view", "热门", "商圈", "外滩", "排队"),
    ),
]


TRAVELER_STYLE_LABELS = {
    "classic": "经典玩法",
    "family": "亲子玩法",
    "couple": "情侣玩法",
    "senior": "老人玩法",
    "photo": "摄影玩法",
    "food": "美食玩法",
    "intense": "特种兵玩法",
}


def get_city_strategy(city: str | None) -> CityStrategy | None:
    normalized = (city or "").strip()
    if not normalized:
        return None
    for strategy in CITY_STRATEGIES:
        if any(alias in normalized or normalized in alias for alias in strategy.aliases):
            return strategy
    return None


def city_strategy_score(stops: list[dict], city: str | None, traveler_style: str | None) -> float:
    strategy = get_city_strategy(city)
    if strategy is None or not stops:
        return 0

    score = 0.0
    for stop in stops:
        destination = stop["destination"]
        if destination_has_any(destination, strategy.match_keywords):
            score += 0.7
        if destination_has_any(destination, strategy.risk_keywords) and destination.risk_level in {"medium", "high"}:
            score -= 0.4

    # City strategy is intentionally capped so it can guide, not override, the user's chosen play style.
    limit = 3.0 if traveler_style in {None, "", "classic"} else 2.0
    return max(-limit, min(limit, round(score, 2)))


def city_strategy_factor(city: str | None, traveler_style: str | None) -> str:
    strategy = get_city_strategy(city)
    if strategy is None:
        return "用户偏好优先"
    return f"{strategy.key}提醒：{strategy.cue}"


def city_strategy_decision_note(city: str | None, traveler_style: str | None) -> str:
    style_label = TRAVELER_STYLE_LABELS.get(traveler_style or "classic", "当前玩法")
    strategy = get_city_strategy(city)
    if strategy is None:
        return f"{style_label}优先；城市特征只做提醒。"
    return f"{style_label}优先；{strategy.key}的{strategy.cue}，只作为提醒。"


def city_strategy_quality_note(city: str | None) -> str:
    strategy = get_city_strategy(city)
    if strategy is None:
        return ""
    return f"{strategy.key}提醒：{strategy.cue}"


def destination_has_any(destination: TripDestination, keywords: tuple[str, ...]) -> bool:
    text = " ".join([destination.name, destination.poi_type, *(destination.tags or [])]).lower()
    return any(keyword.lower() in text for keyword in keywords)

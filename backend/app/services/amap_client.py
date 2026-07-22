from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.route import RouteLeg, WeatherSnapshot
from app.schemas.poi import LocationCandidate, PlacePracticalInfo, PoiCandidate
from app.schemas.trip import Location, TripDestination


class AmapClientError(RuntimeError):
    pass


class AmapClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        settings = get_settings()
        self.api_key = api_key if api_key is not None else settings.amap_api_key
        self.base_url = (base_url if base_url is not None else settings.amap_base_url).rstrip("/")

    def search_pois(self, city: str, keyword: str, limit: int = 5) -> list[PoiCandidate]:
        if not self.api_key:
            return []

        response = httpx.get(
            f"{self.base_url}/v3/place/text",
            params={
                "key": self.api_key,
                "keywords": keyword,
                "city": city,
                "citylimit": "true",
                "offset": str(limit),
                "page": "1",
                "extensions": "all",
                "output": "JSON",
            },
            timeout=6.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "1":
            message = data.get("info") or data.get("infocode") or "Amap request failed"
            raise AmapClientError(str(message))

        candidates: list[PoiCandidate] = []
        for item in data.get("pois", []):
            candidate = poi_from_amap(item)
            if candidate:
                candidates.append(candidate)
        return candidates[:limit]

    def geocode_location(self, city: str, keyword: str) -> LocationCandidate | None:
        if not self.api_key:
            return None

        response = httpx.get(
            f"{self.base_url}/v3/geocode/geo",
            params={
                "key": self.api_key,
                "address": keyword,
                "city": city,
                "output": "JSON",
            },
            timeout=6.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "1":
            message = data.get("info") or data.get("infocode") or "Amap geocode request failed"
            raise AmapClientError(str(message))

        geocodes = data.get("geocodes")
        if not isinstance(geocodes, list) or not geocodes:
            return None
        return location_from_amap(geocodes[0], keyword)

    def reverse_geocode_location(self, lat: float, lng: float) -> LocationCandidate | None:
        if not self.api_key:
            return None

        response = httpx.get(
            f"{self.base_url}/v3/geocode/regeo",
            params={
                "key": self.api_key,
                "location": f"{lng},{lat}",
                "extensions": "base",
                "radius": "100",
                "roadlevel": "0",
                "output": "JSON",
            },
            timeout=6.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "1":
            message = data.get("info") or data.get("infocode") or "Amap reverse geocode request failed"
            raise AmapClientError(str(message))

        regeocode = data.get("regeocode")
        if not isinstance(regeocode, dict):
            return None
        return reverse_location_from_amap(regeocode, lat=lat, lng=lng)

    def build_direction_leg(
        self,
        city: str,
        origin: Location | TripDestination,
        destination: TripDestination,
        transport_label: str,
        mode: str,
        navigation_url: str,
    ) -> RouteLeg:
        if not self.api_key:
            raise AmapClientError("AMAP_API_KEY is missing")

        data = self._request_direction(city, origin, destination, mode)
        duration_seconds, distance_meters = _parse_direction(data, mode)
        if duration_seconds <= 0:
            raise AmapClientError("Amap direction response has no duration")

        return RouteLeg(
            from_name=origin.name,
            to_name=destination.name,
            transport_mode=transport_label,
            duration_minutes=max(1, round(duration_seconds / 60)),
            distance_meters=distance_meters,
            navigation_url=navigation_url,
            source="amap",
        )

    def get_live_weather(self, city: str) -> WeatherSnapshot | None:
        if not self.api_key:
            return None

        response = httpx.get(
            f"{self.base_url}/v3/weather/weatherInfo",
            params={
                "key": self.api_key,
                "city": city,
                "extensions": "base",
                "output": "JSON",
            },
            timeout=6.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "1":
            message = data.get("info") or data.get("infocode") or "Amap weather request failed"
            raise AmapClientError(str(message))

        lives = data.get("lives")
        if not isinstance(lives, list) or not lives:
            return None
        return weather_from_amap(lives[0], city)

    def _request_direction(
        self,
        city: str,
        origin: Location | TripDestination,
        destination: TripDestination,
        mode: str,
    ) -> dict[str, Any]:
        endpoint = {
            "integrated": "/v3/direction/transit/integrated",
            "car": "/v3/direction/driving",
            "walk": "/v3/direction/walking",
        }.get(mode)
        if endpoint is None:
            raise AmapClientError(f"Unsupported Amap direction mode: {mode}")

        params = {
            "key": self.api_key,
            "origin": _coordinate(origin),
            "destination": _coordinate(destination),
            "output": "JSON",
        }
        if mode == "integrated":
            params["city"] = city
            params["cityd"] = city
            params["strategy"] = "0"
        elif mode == "car":
            params["strategy"] = "0"

        response = None
        last_error: httpx.HTTPError | None = None
        for _ in range(2):
            try:
                response = httpx.get(f"{self.base_url}{endpoint}", params=params, timeout=10.0)
                response.raise_for_status()
                break
            except httpx.HTTPError as exc:
                last_error = exc
        if response is None:
            raise last_error or AmapClientError("Amap direction request failed")

        data = response.json()
        if data.get("status") != "1":
            message = data.get("info") or data.get("infocode") or "Amap direction request failed"
            raise AmapClientError(str(message))
        return data


def poi_from_amap(item: dict[str, Any]) -> PoiCandidate | None:
    location = item.get("location")
    if not isinstance(location, str) or "," not in location:
        return None

    lng_text, lat_text = location.split(",", 1)
    try:
        lng = float(lng_text)
        lat = float(lat_text)
    except ValueError:
        return None

    name = _string_value(item.get("name"))
    if not name:
        return None

    poi_type = _string_value(item.get("type")) or "poi"
    tags = _unique([part for part in poi_type.split(";") if part])[:3]
    address = _string_value(item.get("address")) or _string_value(item.get("pname")) or name

    return PoiCandidate(
        source="amap",
        source_poi_id=_string_value(item.get("id")) or f"amap_{lng_text}_{lat_text}",
        name=name,
        address=address,
        lat=lat,
        lng=lng,
        poi_type=poi_type,
        suggested_stay_minutes=_suggest_stay_minutes(name, poi_type),
        risk_level=_risk_level(name, poi_type),
        tags=tags or ["高德POI"],
        note="来自高德 POI 搜索；营业时间、门票和闭馆状态仍需实时确认。",
        practical_info=practical_info_from_amap(item, name, poi_type),
    )


def weather_from_amap(item: dict[str, Any], fallback_city: str) -> WeatherSnapshot:
    wind_direction = _string_value(item.get("winddirection"))
    wind_power = _string_value(item.get("windpower"))
    wind = ""
    if wind_direction and wind_power:
        wind = f"{wind_direction}风 {wind_power}级"
    elif wind_direction:
        wind = f"{wind_direction}风"
    elif wind_power:
        wind = f"{wind_power}级"

    return WeatherSnapshot(
        source="amap",
        city=_string_value(item.get("city")) or fallback_city,
        weather=_string_value(item.get("weather")) or "待确认",
        temperature=_string_value(item.get("temperature")),
        wind=wind,
        humidity=_string_value(item.get("humidity")),
        report_time=_string_value(item.get("reporttime")),
    )


def practical_info_from_amap(item: dict[str, Any], name: str, poi_type: str) -> PlacePracticalInfo:
    biz_ext = item.get("biz_ext")
    if not isinstance(biz_ext, dict):
        biz_ext = {}

    opening_hours = first_text(
        item.get("opentime"),
        item.get("open_time"),
        item.get("business_hours"),
        biz_ext.get("opentime"),
        biz_ext.get("open_time"),
        biz_ext.get("business_hours"),
    )
    rating = first_text(biz_ext.get("rating"), item.get("rating"))
    cost = first_text(biz_ext.get("cost"), item.get("cost"))
    ticket = first_text(
        item.get("ticket"),
        item.get("ticket_price"),
        item.get("ticketPrice"),
        biz_ext.get("ticket"),
        biz_ext.get("ticket_price"),
    )

    source = "amap" if any([opening_hours, rating, cost, ticket]) else "rule"
    confidence = "medium" if source == "amap" else "low"

    return PlacePracticalInfo(
        source=source,
        confidence=confidence,
        opening_hours=opening_hours or "需官方确认",
        ticket=normalize_ticket(ticket, cost, name, poi_type),
        closure_status=closure_status_text(name, poi_type),
        popularity=popularity_text(rating, name, poi_type),
        tips=practical_tips(name, poi_type, source),
    )


def location_from_amap(item: dict[str, Any], fallback_name: str) -> LocationCandidate | None:
    location = item.get("location")
    if not isinstance(location, str) or "," not in location:
        return None

    lng_text, lat_text = location.split(",", 1)
    try:
        lng = float(lng_text)
        lat = float(lat_text)
    except ValueError:
        return None

    name = _string_value(item.get("formatted_address")) or fallback_name
    address = _string_value(item.get("formatted_address")) or fallback_name

    return LocationCandidate(
        source="amap",
        name=name,
        address=address,
        lat=lat,
        lng=lng,
    )


def reverse_location_from_amap(item: dict[str, Any], lat: float, lng: float) -> LocationCandidate | None:
    address = _string_value(item.get("formatted_address"))
    component = item.get("addressComponent")
    if not isinstance(component, dict):
        component = {}

    province = _component_text(component.get("province"))
    city = _component_text(component.get("city")) or province
    district = _component_text(component.get("district"))
    name = address or district or city or "当前位置"

    if not address:
        address = name

    return LocationCandidate(
        source="amap",
        name=name,
        address=address,
        lat=lat,
        lng=lng,
        city=city or None,
    )


def _coordinate(value: Location | TripDestination) -> str:
    return f"{value.lng},{value.lat}"


def _parse_direction(data: dict[str, Any], mode: str) -> tuple[int, int]:
    route = data.get("route")
    if not isinstance(route, dict):
        raise AmapClientError("Amap direction response has no route")

    if mode == "integrated":
        transits = route.get("transits")
        if not isinstance(transits, list) or not transits:
            raise AmapClientError("Amap transit response has no transits")
        first = transits[0]
        return _int_value(first.get("duration")), _int_value(first.get("distance"))

    paths = route.get("paths")
    if not isinstance(paths, list) or not paths:
        raise AmapClientError("Amap direction response has no paths")
    first = paths[0]
    return _int_value(first.get("duration")), _int_value(first.get("distance"))


def _int_value(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return round(value)
    if isinstance(value, str):
        try:
            return round(float(value))
        except ValueError:
            return 0
    return 0


def _string_value(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _component_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return ""
    return ""


def first_text(*values: Any) -> str:
    for value in values:
        text = _string_value(value)
        if text and text not in ["[]", "{}", "0.0", "-1"]:
            return text
    return ""


def normalize_ticket(ticket: str, cost: str, name: str, poi_type: str) -> str:
    text = f"{name};{poi_type}"
    if ticket:
        return ticket
    if any(token in text for token in ["道路", "街区", "步行街", "交通", "地铁", "车站", "商场", "购物"]):
        return "通常无需景区门票，具体店铺、展览或项目另计"
    if cost:
        return f"高德参考消费 {cost} 元；是否为门票需官方确认"
    return "需官方确认"


def closure_status_text(name: str, poi_type: str) -> str:
    text = f"{name};{poi_type}"
    if any(token in text for token in ["暂停开放", "临时闭馆", "闭馆", "停业", "暂停营业"]):
        return "高德名称提示可能暂停开放或闭馆；必须以官方公告确认"
    if any(token in text for token in ["博物馆", "展览馆", "美术馆"]):
        return "未接入官方实时闭馆数据；展馆类常见固定闭馆日或预约限制"
    return "未接入官方实时闭馆数据"


def popularity_text(rating: str, name: str, poi_type: str) -> str:
    if rating:
        return f"高德评分 {rating}"
    text = f"{name};{poi_type}"
    if any(token in text for token in ["外滩", "东方明珠", "豫园", "博物馆", "步行街", "风景名胜", "商圈"]):
        return "热门概率较高，节假日建议预留排队时间"
    return "热度需现场判断"


def practical_tips(name: str, poi_type: str, source: str) -> list[str]:
    text = f"{name};{poi_type}"
    tips = [
        "营业时间、门票、临时闭馆以景区官方、现场公告或购票平台为准。",
    ]
    if source == "amap":
        tips.append("高德扩展字段可辅助判断，但不等于官方实时票务或闭馆状态。")
    if any(token in text for token in ["博物馆", "展览馆", "美术馆"]):
        tips.append("展馆类地点建议提前确认预约、固定闭馆日和最晚入场时间。")
    elif any(token in text for token in ["风景名胜", "旅游景点", "公园"]):
        tips.append("景点类地点建议确认开放区域、夜间灯光和最晚入园时间。")
    elif any(token in text for token in ["餐饮", "购物", "商场", "商业"]):
        tips.append("商业和餐饮营业时间变化较快，以店铺页面或现场公告为准。")
    else:
        tips.append("若目标是具体入口、店铺或展览，请优先核对官方页面。")
    return tips[:3]


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _suggest_stay_minutes(name: str, poi_type: str) -> int:
    text = f"{name};{poi_type}"
    if any(token in text for token in ["博物馆", "展览馆", "美术馆"]):
        return 120
    if any(token in text for token in ["风景名胜", "公园", "景点"]):
        return 90
    if any(token in text for token in ["购物", "商场", "步行街"]):
        return 80
    if any(token in text for token in ["餐饮", "小吃", "美食"]):
        return 60
    return 70


def _risk_level(name: str, poi_type: str) -> str:
    text = f"{name};{poi_type}"
    if any(token in text for token in ["暂停开放", "临时闭馆", "闭馆", "停业", "暂停营业"]):
        return "high"
    if any(token in text for token in ["博物馆", "展览馆", "美术馆", "旅游景点"]):
        return "medium"
    return "low"

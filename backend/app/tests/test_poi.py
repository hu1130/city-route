from app.core.config import get_settings
from app.services.amap_client import AmapClientError, location_from_amap, poi_from_amap, reverse_location_from_amap
from app.services.poi_resolver import resolve_location, reverse_geocode_location, search_pois


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_search_bund(client):
    response = client.post("/api/poi/search", json={"city": "上海", "keyword": "外滩"})
    assert response.status_code == 200
    data = response.json()
    assert len(data["candidates"]) == 1
    assert data["candidates"][0]["sourcePoiId"] == "the_bund"
    assert data["candidates"][0]["practicalInfo"]["openingHours"] == "需官方确认"


def test_search_unknown_place_returns_empty(client):
    response = client.post("/api/poi/search", json={"city": "上海", "keyword": "不存在地点"})
    assert response.status_code == 200
    assert response.json()["candidates"] == []


def test_geocode_people_square(client):
    response = client.post("/api/poi/geocode", json={"city": "上海", "keyword": "人民广场"})
    assert response.status_code == 200
    location = response.json()["location"]
    assert location["name"] == "人民广场"
    assert location["lat"] == 31.2304
    assert location["lng"] == 121.4737


def test_geocode_unknown_place_returns_null(client):
    response = client.post("/api/poi/geocode", json={"city": "上海", "keyword": "不存在地点"})
    assert response.status_code == 200
    assert response.json()["location"] is None


def test_reverse_geocode_returns_browser_coordinate_fallback(client):
    response = client.post("/api/poi/reverse-geocode", json={"lat": 31.2304, "lng": 121.4737})
    assert response.status_code == 200
    location = response.json()["location"]
    assert location["source"] == "browser"
    assert location["name"] == "当前位置"
    assert location["lat"] == 31.2304
    assert location["lng"] == 121.4737


def test_amap_poi_mapping():
    candidate = poi_from_amap(
        {
            "id": "B0FFTEST",
            "name": "东方明珠广播电视塔",
            "address": "世纪大道1号",
            "location": "121.499809,31.239666",
            "type": "风景名胜;风景名胜相关;旅游景点",
        }
    )

    assert candidate is not None
    data = candidate.model_dump(by_alias=True)
    assert data["source"] == "amap"
    assert data["sourcePoiId"] == "B0FFTEST"
    assert data["name"] == "东方明珠广播电视塔"
    assert data["lng"] == 121.499809
    assert data["lat"] == 31.239666
    assert data["riskLevel"] == "medium"
    assert data["tags"] == ["风景名胜", "风景名胜相关", "旅游景点"]
    assert data["practicalInfo"]["closureStatus"] == "未接入官方实时闭馆数据"


def test_amap_poi_mapping_practical_info_from_extensions():
    candidate = poi_from_amap(
        {
            "id": "B0FFTEST",
            "name": "上海博物馆",
            "address": "人民大道201号",
            "location": "121.4706,31.2303",
            "type": "风景名胜;博物馆;旅游景点",
            "opentime": "09:00-17:00",
            "biz_ext": {"rating": "4.8", "cost": "0"},
        }
    )

    assert candidate is not None
    data = candidate.model_dump(by_alias=True)
    assert data["practicalInfo"]["source"] == "amap"
    assert data["practicalInfo"]["confidence"] == "medium"
    assert data["practicalInfo"]["openingHours"] == "09:00-17:00"
    assert data["practicalInfo"]["popularity"] == "高德评分 4.8"
    assert "闭馆" in data["practicalInfo"]["closureStatus"]


def test_amap_poi_mapping_detects_closed_name_hint():
    candidate = poi_from_amap(
        {
            "id": "B0FFTEST",
            "name": "上海博物馆(人民广场馆)(暂停开放)",
            "address": "人民大道201号",
            "location": "121.4706,31.2303",
            "type": "风景名胜;博物馆;旅游景点",
        }
    )

    assert candidate is not None
    data = candidate.model_dump(by_alias=True)
    assert data["riskLevel"] == "high"
    assert "暂停开放" in data["practicalInfo"]["closureStatus"]


def test_amap_poi_mapping_deduplicates_tags():
    candidate = poi_from_amap(
        {
            "id": "B0FFTEST",
            "name": "外滩",
            "address": "中山东二路1号",
            "location": "121.490317,31.237804",
            "type": "风景名胜;风景名胜;国家级景点",
        }
    )

    assert candidate is not None
    assert candidate.tags == ["风景名胜", "国家级景点"]


def test_amap_location_mapping():
    location = location_from_amap(
        {
            "formatted_address": "上海市黄浦区人民广场",
            "location": "121.473701,31.230416",
        },
        "人民广场",
    )

    assert location is not None
    data = location.model_dump(by_alias=True)
    assert data["source"] == "amap"
    assert data["name"] == "上海市黄浦区人民广场"
    assert data["lng"] == 121.473701
    assert data["lat"] == 31.230416


def test_amap_reverse_location_mapping():
    location = reverse_location_from_amap(
        {
            "formatted_address": "Shanghai Huangpu District People Square",
            "addressComponent": {
                "province": "Shanghai",
                "city": [],
                "district": "Huangpu District",
            },
        },
        lat=31.230416,
        lng=121.473701,
    )

    assert location is not None
    data = location.model_dump(by_alias=True)
    assert data["source"] == "amap"
    assert data["name"] == "Shanghai Huangpu District People Square"
    assert data["address"] == "Shanghai Huangpu District People Square"
    assert data["city"] == "Shanghai"
    assert data["lng"] == 121.473701
    assert data["lat"] == 31.230416


def test_amap_failure_falls_back_to_mock(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("CITY_ROUTE_USE_AMAP", "true")
    monkeypatch.setenv("AMAP_API_KEY", "fake-key-for-test")
    get_settings.cache_clear()

    def fail_search(*args, **kwargs):
        raise AmapClientError("network failed")

    monkeypatch.setattr("app.services.amap_client.AmapClient.search_pois", fail_search)

    matches = search_pois("上海", "外滩")
    assert matches[0].source_poi_id == "the_bund"


def test_amap_geocode_failure_falls_back_to_mock(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("CITY_ROUTE_USE_AMAP", "true")
    monkeypatch.setenv("AMAP_API_KEY", "fake-key-for-test")
    get_settings.cache_clear()

    def fail_geocode(*args, **kwargs):
        raise AmapClientError("network failed")

    monkeypatch.setattr("app.services.amap_client.AmapClient.geocode_location", fail_geocode)

    location = resolve_location("上海", "人民广场")
    assert location is not None
    assert location.name == "人民广场"


def test_amap_reverse_geocode_failure_falls_back_to_browser_coordinate(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("CITY_ROUTE_USE_AMAP", "true")
    monkeypatch.setenv("AMAP_API_KEY", "fake-key-for-test")
    get_settings.cache_clear()

    def fail_reverse_geocode(*args, **kwargs):
        raise AmapClientError("network failed")

    monkeypatch.setattr("app.services.amap_client.AmapClient.reverse_geocode_location", fail_reverse_geocode)

    location = reverse_geocode_location(31.2304, 121.4737)
    assert location.source == "browser"
    assert location.name == "当前位置"
    assert location.lat == 31.2304
    assert location.lng == 121.4737

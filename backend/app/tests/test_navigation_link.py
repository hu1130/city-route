from urllib.parse import parse_qs, urlparse

from app.schemas.trip import Location, TripDestination
from app.services.navigation_link import build_navigation_url


def test_navigation_url_encodes_names_and_transit_mode():
    origin = Location(name="People Square", lat=31.2304, lng=121.4737)
    destination = TripDestination(
        source_poi_id="yu_garden",
        raw_name="Yu Garden",
        name="Yu Garden & Bazaar",
        lat=31.2272,
        lng=121.4921,
    )

    url = build_navigation_url(origin, destination, "integrated")

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "uri.amap.com"
    assert parsed.path == "/navigation"
    assert query["from"] == ["121.4737,31.2304,People Square"]
    assert query["to"] == ["121.4921,31.2272,Yu Garden & Bazaar"]
    assert query["mode"] == ["bus"]
    assert query["policy"] == ["1"]
    assert "Yu+Garden+%26+Bazaar" in url

from urllib.parse import urlencode

from app.schemas.trip import Location, TripDestination


def build_navigation_url(origin: Location | TripDestination, destination: TripDestination, mode: str) -> str:
    query = urlencode(
        {
            "from": f"{origin.lng},{origin.lat},{origin.name}",
            "to": f"{destination.lng},{destination.lat},{destination.name}",
            "mode": navigation_mode(mode),
            "policy": "1",
        },
        safe=",",
    )
    return f"https://uri.amap.com/navigation?{query}"


def navigation_mode(mode: str) -> str:
    if mode == "integrated":
        return "bus"
    return mode

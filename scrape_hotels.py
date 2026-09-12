#!/usr/bin/env python3
"""Scrape Presto EventPipe hotel search via prestoservice API (no browser)."""
from __future__ import annotations

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://prestoservice.eventpipe.com"
SITE = "https://presto.eventpipe.com"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


def http_json(url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="GET" if body is None else "POST",
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "Origin": SITE,
            "Referer": f"{SITE}/",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def hotel_link(event_id: str, shop_key: str, hotel_code: str) -> str:
    return f"{SITE}/event/{event_id}/shopKey/{shop_key}/hotel/{hotel_code}"


def normalize_hotel(h: dict, event_id: str, shop_key: str) -> dict:
    loc = h.get("hotelLocation") or {}
    imgs = h.get("fullImages") or []
    thumb = None
    for im in imgs:
        links = (im or {}).get("links") or {}
        for size in ("350px", "500px", "1000px"):
            if size in links and links[size].get("href"):
                thumb = links[size]["href"]
                break
        if thumb:
            break
    rooms = []
    for rm in h.get("rooms") or []:
        rates = rm.get("rates") or []
        rate0 = rates[0] if rates else {}
        rooms.append(
            {
                "name": rm.get("fullRoomName") or rm.get("roomName"),
                "availability": rm.get("availabilityType"),
                "maxOccupancy": rm.get("maximumOccupancy"),
                "avgNightly": rate0.get("averageNightlyRate"),
                "totalAfterTax": rate0.get("amountAfterTax"),
                "availableRooms": (rate0.get("nights") or [{}])[0].get("availableRooms")
                if rate0.get("nights")
                else None,
            }
        )
    amenities = []
    for a in h.get("hotelAmenities") or []:
        if isinstance(a, dict):
            amenities.append(a.get("name") or a.get("description") or str(a))
        else:
            amenities.append(str(a))
    code = h.get("hotelCode") or ""
    return {
        "hotelCode": code,
        "name": h.get("hotelName"),
        "distanceMi": h.get("distance"),
        "drivingMi": h.get("driving"),
        "directMi": h.get("direct"),
        "rating": h.get("rating"),
        "availability": h.get("availabilityType"),
        "avgPerNight": h.get("lowestAveragePerNight"),
        "peakNight": h.get("lowestPeakNightRate"),
        "lowestTotal": h.get("lowestTotal"),
        "currency": h.get("currency") or "USD",
        "isContracted": h.get("isContracted"),
        "isPreferred": h.get("isPreferred"),
        "isHost": h.get("isHost"),
        "waitListEnabled": h.get("waitListEnabled"),
        "cutoffDate": h.get("cutoffDate"),
        "checkinTime": h.get("checkinTime"),
        "checkoutTime": h.get("checkoutTime"),
        "resortFee": h.get("resortFee"),
        "resortFeeType": h.get("resortFeeType"),
        "address": loc.get("addressLineOne"),
        "city": loc.get("city"),
        "state": loc.get("stateProvince"),
        "postal": loc.get("postalCode"),
        "lat": float(loc["latitude"]) if loc.get("latitude") not in (None, "") else None,
        "lng": float(loc["longitude"]) if loc.get("longitude") not in (None, "") else None,
        "thumb": thumb,
        "amenities": amenities,
        "rooms": rooms,
        "roomCount": len(rooms),
        "link": hotel_link(event_id, shop_key, code) if code else None,
        "customBanner": h.get("customBanner"),
    }


def scrape(event_id: str, shop_key: str, radius: float = 30, max_page: int = 50) -> dict:
    params = http_json(f"{BASE}/params/{shop_key}")
    event = http_json(f"{BASE}/events/{event_id}")
    body = {
        **params,
        "key": params.get("key") or params.get("shopKey") or shop_key,
        "shopKey": params.get("shopKey") or shop_key,
        "eventId": params.get("eventId") or event_id,
        "offset": 0,
        "sort": params.get("sort") or "Distance",
        "radius": radius,
        "amenityFilters": [],
        "propertyFilter": "",
        "roomTypeFilter": [],
        "dateRangeDisplay": f"{params.get('startDate')} - {params.get('endDate')}",
        "max": max_page,
        "registrations": params.get("registrations"),
    }
    all_hotels = []
    seen = set()
    offset = 0
    resp_shop = shop_key
    while True:
        body["offset"] = offset
        raw = http_json(f"{BASE}/events/{event_id}/hotels", body)
        resp_shop = raw.get("shopKey") or resp_shop
        batch = raw.get("hotels") or []
        new = 0
        for h in batch:
            code = h.get("hotelCode")
            if code in seen:
                continue
            seen.add(code)
            all_hotels.append(h)
            new += 1
        if not batch or new == 0:
            break
        # API often returns full set even with max; stop if we got fewer than page size
        # or if offset response indicates end
        if len(batch) < max_page and offset > 0:
            break
        # First response with 125 and max=50 — already complete; don't loop forever
        if offset == 0 and len(batch) >= max_page:
            # try next page
            offset = len(all_hotels)
            if offset == 0:
                break
            # if first page returned more than max, assume complete dump
            if len(batch) > max_page:
                break
            continue
        break

    normalized = [normalize_hotel(h, event_id, resp_shop) for h in all_hotels]
    return {
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "eventId": event_id,
            "shopKeyIn": shop_key,
            "shopKeyOut": resp_shop,
            "searchUrl": f"{SITE}/event/{event_id}/shopKey/{shop_key}/search",
            "api": f"{BASE}/events/{event_id}/hotels",
        },
        "event": {
            "name": event.get("name"),
            "startDate": event.get("startDate"),
            "endDate": event.get("endDate"),
            "venueName": event.get("venueName"),
            "city": event.get("city"),
            "bookingType": event.get("currentBookingType") or event.get("bookingType"),
            "defaultCheckin": event.get("defaultCheckinDate"),
            "defaultCheckout": event.get("defaultCheckoutDate"),
        },
        "search": {
            "formattedAddress": params.get("formattedAddress"),
            "latitude": params.get("latitude"),
            "longitude": params.get("longitude"),
            "startDate": params.get("startDate"),
            "endDate": params.get("endDate"),
            "rooms": params.get("rooms"),
            "registrations": params.get("registrations"),
            "radius": radius,
            "sort": body["sort"],
        },
        "counts": {
            "hotels": len(normalized),
            "byAvailability": {},
        },
        "hotels": normalized,
        "rawHotelCount": len(all_hotels),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--event-id", required=True)
    ap.add_argument("--shop-key", required=True)
    ap.add_argument("--out", type=Path, default=Path("hotels.json"))
    ap.add_argument("--raw-out", type=Path, default=None)
    ap.add_argument("--radius", type=float, default=30)
    args = ap.parse_args()

    # Always keep a fresh raw single-page dump for debugging
    params = http_json(f"{BASE}/params/{args.shop_key}")
    event = http_json(f"{BASE}/events/{args.event_id}")
    body = {
        **params,
        "key": params.get("key") or params.get("shopKey") or args.shop_key,
        "shopKey": params.get("shopKey") or args.shop_key,
        "eventId": params.get("eventId") or args.event_id,
        "offset": 0,
        "sort": params.get("sort") or "Distance",
        "radius": args.radius,
        "amenityFilters": [],
        "propertyFilter": "",
        "roomTypeFilter": [],
        "dateRangeDisplay": f"{params.get('startDate')} - {params.get('endDate')}",
        "max": 50,
        "registrations": params.get("registrations"),
    }
    raw = http_json(f"{BASE}/events/{args.event_id}/hotels", body)
    raw_path = args.raw_out or args.out.with_name("hotels-raw.json")
    raw_path.write_text(json.dumps(raw, indent=2))
    params_path = args.out.with_name("params.json")
    event_path = args.out.with_name("event.json")
    params_path.write_text(json.dumps(params, indent=2))
    event_path.write_text(json.dumps(event, indent=2))

    shop_out = raw.get("shopKey") or args.shop_key
    hotels = [normalize_hotel(h, args.event_id, shop_out) for h in (raw.get("hotels") or [])]
    by_av = {}
    for h in hotels:
        by_av[h["availability"] or "UNKNOWN"] = by_av.get(h["availability"] or "UNKNOWN", 0) + 1

    out = {
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "eventId": args.event_id,
            "shopKeyIn": args.shop_key,
            "shopKeyOut": shop_out,
            "searchUrl": f"{SITE}/event/{args.event_id}/shopKey/{args.shop_key}/search",
            "api": f"{BASE}/events/{args.event_id}/hotels",
        },
        "event": {
            "name": event.get("name"),
            "startDate": event.get("startDate"),
            "endDate": event.get("endDate"),
            "venueName": event.get("venueName"),
            "city": event.get("city"),
            "bookingType": event.get("currentBookingType") or event.get("bookingType"),
            "defaultCheckin": event.get("defaultCheckinDate"),
            "defaultCheckout": event.get("defaultCheckoutDate"),
        },
        "search": {
            "formattedAddress": params.get("formattedAddress"),
            "latitude": params.get("latitude"),
            "longitude": params.get("longitude"),
            "startDate": params.get("startDate"),
            "endDate": params.get("endDate"),
            "rooms": params.get("rooms"),
            "registrations": params.get("registrations"),
            "radius": args.radius,
            "sort": body["sort"],
        },
        "counts": {"hotels": len(hotels), "byAvailability": by_av},
        "hotels": hotels,
    }
    args.out.write_text(json.dumps(out, indent=2))
    # dashboard copy
    dash = Path("dashboard")
    if dash.is_dir():
        (dash / "hotels.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({"hotels": len(hotels), "byAvailability": by_av, "out": str(args.out)}, indent=2))


if __name__ == "__main__":
    main()

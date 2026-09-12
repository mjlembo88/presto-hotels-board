# Presto EventPipe hotels

Interactive hotel board for **2027 Florida Volleyball Challenge** (Orlando).

## Entry path (Mark-taught)

1. **Lander:** https://www.teamtravelsource.com/volleyball_lander/floridaregion/
2. Opens Presto event **2027 Florida Volleyball Challenge**  
   Event id: `dfc7b549-7bf9-4ba0-b048-eefe3613ba7a`  
   Dates: Fri 2027-03-26 → Sun 2027-03-28 · Orange County Convention Center
3. Org/team: **HERNANDO ELITE VOLLEYBALL CLUB** → occupancy (kids ages) → **SEARCH**
4. Results URL shape:  
   `https://presto.eventpipe.com/event/{eventId}/shopKey/{shopKey}/search`

### shopKey notes

| Role | shopKey | Notes |
|------|---------|--------|
| Mark-taught results (current) | `6aa5d8d624a92930e04eebbe` | Hernando Elite · rooms adults:1 childAges [1,14] |
| Earlier scrape | `6aa5d5f824a92930e04ee530` | Same event/org; childAges order differed [14,1] |
| API response may rewrite | e.g. `6aa5d911…` | `shopKeyOut` in `hotels.json` — use for hotel detail links |

`shopKey` is a **search-session** token from the lander → org/occupancy flow, not a fixed event constant. Re-run scrape with the shopKey from the live results URL after teaching/search.

## Refresh data (API — no browser)

```bash
cd /workspace/hotels-presto
python3 scrape_hotels.py \
  --event-id dfc7b549-7bf9-4ba0-b048-eefe3613ba7a \
  --shop-key 6aa5d8d624a92930e04eebbe \
  --out hotels.json
```

Endpoints:

- `GET https://prestoservice.eventpipe.com/params/{shopKey}`
- `GET https://prestoservice.eventpipe.com/events/{eventId}`
- `POST https://prestoservice.eventpipe.com/events/{eventId}/hotels` (JSON body = params + filters)

## Dashboard

Local:

```bash
cd /workspace/hotels-presto/dashboard
python3 -m http.server 8770
```

Pages: https://mjlembo88.github.io/presto-hotels-board/

Sort/filter/search table + mobile cards + **Map** tab (Leaflet pins, filters apply, venue marker). `?view=map` opens map. Links open Presto. **Read-only — no bookings.**

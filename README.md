# Presto EventPipe hotels

Interactive hotel board for the Florida Volleyball Challenge 2027 shop search.

## Refresh data

```bash
cd /workspace/hotels-presto
python3 scrape_hotels.py \
  --event-id dfc7b549-7bf9-4ba0-b048-eefe3613ba7a \
  --shop-key 6aa5d5f824a92930e04ee530 \
  --out hotels.json
```

API (no browser): `POST https://prestoservice.eventpipe.com/events/{eventId}/hotels`  
Params: `GET .../params/{shopKey}` · Event: `GET .../events/{eventId}`

## Dashboard

```bash
cd /workspace/hotels-presto/dashboard
python3 -m http.server 8770
```

Open http://127.0.0.1:8770/

No bookings or purchases from this board — links open Presto for manual review.

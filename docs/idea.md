# nominatim-mcp-server

Geocoding, reverse geocoding, and spatial queries via OpenStreetMap Nominatim and Overpass APIs.

## Data source

- **Nominatim** — forward/reverse geocoding, address parsing, place search
- **Overpass API** — spatial queries ("all hospitals within 5km of X")
- **Auth**: None required
- **Rate limits**: Nominatim public instance: 1 req/sec, must set User-Agent. Overpass: concurrent query limits.

## Why it earns its keep

Geocoding is foundational infrastructure. "Where is X?" and "what's near Y?" show up in countless agent workflows. The NWS weather server already needs coordinates but agents have no way to resolve place names. Global coverage, not just US.

## Target users

- Any agent workflow needing location resolution (place name → coordinates)
- Agents combining location data with other servers (NWS, earthquake, GBIF)
- Spatial analysis — finding nearby points of interest
- Address parsing and validation

## Scope

- Read-only
- Forward geocoding (place name/address → lat/lon + metadata)
- Reverse geocoding (lat/lon → address/place)
- Structured address search
- Overpass spatial queries (POIs, infrastructure within radius/bbox)
- Place details and hierarchy (city → state → country)

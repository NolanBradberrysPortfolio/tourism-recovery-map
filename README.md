# Tourism Recovery Map

Interactive country choropleth for international tourist arrivals recovery.

The app compares any selected From year with any selected To year for every
country or territory with a defensible tourism-arrivals series. Reported values
stay source-labelled; missing 2024 values are filled with clearly labelled model
estimates, while other missing selected years remain gray instead of being hidden.
Source-gap countries remain searchable with a no-series explanation.

## Data

- Primary dataset: UN Tourism (2025), processed by Our World in Data.
- Fallback dataset: World Bank WDI `ST.INT.ARVL`, used only to fill missing
  years when overlapping country-year values match the primary series within 2%.
- Modeled 2024 fill: when a record lacks reported 2024 arrivals, the app models
  2024 from that record's latest reported value, preferring 2019 when present,
  multiplied by the median reported recovery ratio for comparable subregion,
  region, or global peers. These values are labelled as estimates, not official
  arrivals.
- App feed: https://ourworldindata.org/grapher/international-tourist-trips
- Metric: annual inbound overnight visitor arrivals.
- Latest country-level year in the feed: 2024.
- Generated coverage in this build: 212 data series; 208 are separately drawn by
  the current base map, 2019 has 181 series, 2022 has 138, and 2024 has 212
  values: 67 reported and 145 modeled.
- Searchable data records not separately drawn by the base map: French Guiana,
  Guadeloupe, Martinique, Reunion, and Tuvalu.

Tourism-arrival caveats matter: arrivals are trips, not unique people; collection
methods vary by country; some countries use border statistics, accommodation
statistics, air-only arrivals, or broader visitor counts.

Digital nomad increase/decrease is intentionally not mapped because there is no
authoritative global country-level destination time series. A defensible future
layer would be categorical digital-nomad or remote-work visa policy status with
country-level government sources.

## Development

```bash
npm install
npm run data:refresh
npm run dev
```

## Validation

```bash
npm run lint
npm run build
npm run review:static
npm run test:e2e
npm run review:loop
```

`review:static` runs 60 adversarial static checks across several year-pair data
scenarios. `test:e2e` and `review:loop` rebuild production output before serving
preview, so Playwright does not run against stale `dist`. `review:loop` runs 20
repeated iPhone-profile interaction passes through From/To year switching,
search, data notes, and map zoom controls.

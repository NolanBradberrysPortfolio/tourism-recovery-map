# Tourism Recovery Map

Interactive country choropleth for international tourist arrivals recovery.

The app compares each country or territory's latest reported arrivals year against
2019, 2022, 2024, or its prior reported year. Countries with missing comparable
data are shown in gray rather than imputed.

## Data

- Primary dataset: UN Tourism (2025), processed by Our World in Data.
- App feed: https://ourworldindata.org/grapher/international-tourist-trips
- Metric: annual inbound overnight visitor arrivals.
- Latest country-level year in the feed: 2024.
- Generated coverage in this build: 2019 has 174 series, 2022 has 138, and
  2024 has 67.

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

`review:static` runs 60 adversarial static checks. `review:loop` runs 20 repeated
iPhone-profile interaction passes through baseline switching, search, data notes,
and map zoom controls.

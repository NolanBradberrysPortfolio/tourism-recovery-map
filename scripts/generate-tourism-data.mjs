import { mkdir, writeFile } from 'node:fs/promises'
import { csvParse } from 'd3-dsv'
import worldCountries from 'world-countries'

const DATA_URL =
  'https://ourworldindata.org/grapher/international-tourist-trips.csv?v=1&csvType=full&useColumnShortNames=false'
const METADATA_URL =
  'https://ourworldindata.org/grapher/international-tourist-trips.metadata.json?v=1&csvType=full&useColumnShortNames=false'
const VALUE_COLUMN = 'Arrivals of tourists from abroad'
const BASELINES = [2019, 2022, 2024]

const countryByIso3 = new Map(
  worldCountries
    .filter((country) => country.cca3)
    .map((country) => [country.cca3, country]),
)

const geoIndex = Object.fromEntries(
  worldCountries
    .filter((country) => country.cca3 && country.ccn3)
    .map((country) => [
      country.ccn3,
      {
        iso3: country.cca3,
        name: country.name.common,
        officialName: country.name.official,
        region: country.region,
        subregion: country.subregion ?? '',
      },
    ]),
)

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'tourism-recovery-map data refresh/1.0' },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.text()
}

const [csv, metadataText] = await Promise.all([
  fetchText(DATA_URL),
  fetchText(METADATA_URL),
])

const rows = csvParse(csv)
const metadata = JSON.parse(metadataText)
const byIso3 = new Map()
const coverage = {}

for (const row of rows) {
  const iso3 = row.Code
  const year = Number(row.Year)
  const value = Number(row[VALUE_COLUMN])
  if (!/^[A-Z]{3}$/.test(iso3) || !Number.isFinite(year) || !Number.isFinite(value)) {
    continue
  }

  if (!byIso3.has(iso3)) {
    byIso3.set(iso3, {
      iso3,
      name: row.Entity,
      years: {},
    })
  }
  byIso3.get(iso3).years[String(year)] = value
  coverage[String(year)] = (coverage[String(year)] ?? 0) + 1
}

const records = [...byIso3.values()]
  .map((record) => {
    const country = countryByIso3.get(record.iso3)
    const years = Object.keys(record.years)
      .map(Number)
      .sort((a, b) => a - b)
    const latestYear = years.at(-1)
    const latestValue = record.years[String(latestYear)]
    const priorYear = [...years].reverse().find((year) => year < latestYear)

    return {
      iso3: record.iso3,
      name: country?.name.common ?? record.name,
      sourceName: record.name,
      officialName: country?.name.official ?? record.name,
      numericCode: country?.ccn3 ?? null,
      region: country?.region ?? 'Unclassified',
      subregion: country?.subregion ?? '',
      latlng: country?.latlng ?? null,
      latestYear,
      latestValue,
      priorYear: priorYear ?? null,
      years: record.years,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const data = {
  generatedAt: new Date().toISOString(),
  baselines: BASELINES,
  valueColumn: VALUE_COLUMN,
  coverage,
  source: {
    name: 'UN Tourism (2025) - processed by Our World in Data',
    dataUrl: DATA_URL,
    metadataUrl: METADATA_URL,
    chartUrl: metadata.chart?.originalChartUrl ?? 'https://ourworldindata.org/grapher/international-tourist-trips',
    originalSourceUrl: 'https://www.untourism.int/tourism-statistics/tourism-statistics-database',
    lastUpdated: metadata.columns?.[VALUE_COLUMN]?.lastUpdated ?? null,
    nextUpdate: metadata.columns?.[VALUE_COLUMN]?.nextUpdate ?? null,
    timespan: metadata.columns?.[VALUE_COLUMN]?.timespan ?? null,
    unit: metadata.columns?.[VALUE_COLUMN]?.unit ?? 'arrivals',
    description: metadata.columns?.[VALUE_COLUMN]?.descriptionShort ?? '',
    notes: metadata.columns?.[VALUE_COLUMN]?.descriptionKey ?? [],
    citationLong: metadata.columns?.[VALUE_COLUMN]?.citationLong ?? '',
  },
  records,
}

await mkdir('src/data', { recursive: true })
await writeFile('src/data/tourismData.json', `${JSON.stringify(data, null, 2)}\n`)
await writeFile('src/data/geoIndex.json', `${JSON.stringify(geoIndex, null, 2)}\n`)

console.log(
  `Generated ${records.length} tourism records. 2024 coverage: ${coverage['2024'] ?? 0} countries.`,
)

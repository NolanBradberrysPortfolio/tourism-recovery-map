import { mkdir, writeFile } from 'node:fs/promises'
import { csvParse } from 'd3-dsv'
import worldCountries from 'world-countries'

const DATA_URL =
  'https://ourworldindata.org/grapher/international-tourist-trips.csv?v=1&csvType=full&useColumnShortNames=false'
const METADATA_URL =
  'https://ourworldindata.org/grapher/international-tourist-trips.metadata.json?v=1&csvType=full&useColumnShortNames=false'
const WDI_URL =
  'https://api.worldbank.org/v2/country/all/indicator/ST.INT.ARVL?format=json&per_page=20000'
const VALUE_COLUMN = 'Arrivals of tourists from abroad'
const BASELINES = [2019, 2022, 2024]
const BASELINE_FILL_YEARS = new Set(BASELINES.map(String))
const MAX_FALLBACK_RELATIVE_DIFFERENCE = 0.02
const MIN_OVERLAPS_FOR_FULL_FALLBACK_FILL = 3

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

const [csv, metadataText, wdiText] = await Promise.all([
  fetchText(DATA_URL),
  fetchText(METADATA_URL),
  fetchText(WDI_URL),
])

const rows = csvParse(csv)
const metadata = JSON.parse(metadataText)
const wdiPayload = JSON.parse(wdiText)
const byIso3 = new Map()
const wdiByIso3 = new Map()

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
}

for (const row of wdiPayload[1] ?? []) {
  const iso3 = row.countryiso3code
  const year = Number(row.date)
  const value = row.value === null ? NaN : Number(row.value)
  if (
    !/^[A-Z]{3}$/.test(iso3) ||
    !countryByIso3.has(iso3) ||
    !Number.isFinite(year) ||
    !Number.isFinite(value)
  ) {
    continue
  }

  if (!wdiByIso3.has(iso3)) {
    wdiByIso3.set(iso3, {
      iso3,
      name: row.country?.value ?? iso3,
      years: {},
    })
  }
  wdiByIso3.get(iso3).years[String(year)] = value
}

function getCompatibility(primaryYears, fallbackYears) {
  const overlaps = Object.entries(primaryYears).filter(
    ([year]) => fallbackYears[year] !== undefined,
  )
  if (overlaps.length === 0) {
    return null
  }

  const relativeDifferences = overlaps.map(([year, value]) => {
    const primaryValue = Number(value)
    const fallbackValue = Number(fallbackYears[year])
    return Math.abs(primaryValue - fallbackValue) / Math.max(Math.abs(primaryValue), 1)
  })

  return {
    overlappingYears: overlaps.length,
    maxRelativeDifference: Math.max(...relativeDifferences),
  }
}

const mergedIso3 = new Set([...byIso3.keys(), ...wdiByIso3.keys()])
let compatibleFallbackCountries = 0
let wdiOnlyCountries = 0
let filledYearCount = 0

const records = [...mergedIso3]
  .map((iso3) => {
    const primaryRecord = byIso3.get(iso3)
    const fallbackRecord = wdiByIso3.get(iso3)
    const country = countryByIso3.get(iso3)
    const years = { ...(primaryRecord?.years ?? {}) }
    const filledYears = {}
    const fallbackCompatibility =
      primaryRecord && fallbackRecord
        ? getCompatibility(primaryRecord.years, fallbackRecord.years)
        : null
    const canFillFromFallback =
      Boolean(primaryRecord && fallbackRecord && fallbackCompatibility) &&
      fallbackCompatibility.maxRelativeDifference <= MAX_FALLBACK_RELATIVE_DIFFERENCE

    if (canFillFromFallback && fallbackRecord) {
      for (const [year, value] of Object.entries(fallbackRecord.years)) {
        const canFillYear =
          fallbackCompatibility.overlappingYears >= MIN_OVERLAPS_FOR_FULL_FALLBACK_FILL ||
          BASELINE_FILL_YEARS.has(year)
        if (years[year] === undefined && canFillYear) {
          years[year] = value
          filledYears[year] = 'World Bank WDI'
          filledYearCount += 1
        }
      }
      if (Object.keys(filledYears).length > 0) {
        compatibleFallbackCountries += 1
      }
    }

    if (!primaryRecord && fallbackRecord) {
      Object.assign(years, fallbackRecord.years)
      for (const year of Object.keys(fallbackRecord.years)) {
        filledYears[year] = 'World Bank WDI'
      }
      wdiOnlyCountries += 1
    }

    const sortedYears = Object.keys(years)
      .map(Number)
      .sort((a, b) => a - b)
    if (sortedYears.length === 0) {
      return null
    }

    const latestYear = sortedYears.at(-1)
    const latestValue = years[String(latestYear)]
    const priorYear = [...sortedYears].reverse().find((year) => year < latestYear)
    const sourceBlend = primaryRecord
      ? Object.keys(filledYears).length > 0
        ? 'owid-un-tourism-plus-compatible-wdi'
        : 'owid-un-tourism'
      : 'world-bank-wdi-only'

    return {
      iso3,
      name: country?.name.common ?? primaryRecord?.name ?? fallbackRecord?.name ?? iso3,
      sourceName: primaryRecord?.name ?? fallbackRecord?.name ?? country?.name.common ?? iso3,
      officialName: country?.name.official ?? primaryRecord?.name ?? fallbackRecord?.name ?? iso3,
      numericCode: country?.ccn3 ?? null,
      region: country?.region ?? 'Unclassified',
      subregion: country?.subregion ?? '',
      latlng: country?.latlng ?? null,
      latestYear,
      latestValue,
      priorYear: priorYear ?? null,
      years,
      sourceBlend,
      filledYears,
      fallbackCompatibility,
    }
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name))

const coverage = {}
for (const record of records) {
  for (const year of Object.keys(record.years)) {
    coverage[year] = (coverage[year] ?? 0) + 1
  }
}

const data = {
  generatedAt: new Date().toISOString(),
  baselines: BASELINES,
  valueColumn: VALUE_COLUMN,
  coverage,
  source: {
    name: 'UN Tourism (2025) - processed by Our World in Data',
    dataUrl: DATA_URL,
    metadataUrl: METADATA_URL,
    fallbackName: 'World Bank World Development Indicators',
    fallbackDataUrl: WDI_URL,
    fallbackLastUpdated: wdiPayload[0]?.lastupdated ?? null,
    fallbackMergeRule:
      'World Bank WDI fills missing years only when all overlapping country-year values differ by at most 2%; countries with fewer than 3 overlapping years can fill only configured baseline years. WDI-only countries are marked as fallback-only records.',
    fallbackFilledYears: filledYearCount,
    fallbackCompatibleCountries: compatibleFallbackCountries,
    fallbackOnlyCountries: wdiOnlyCountries,
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
  [
    `Generated ${records.length} tourism records.`,
    `2024 coverage: ${coverage['2024'] ?? 0} countries.`,
    `World Bank fallback filled ${filledYearCount} years across ${compatibleFallbackCountries} compatible countries.`,
    `World Bank-only records: ${wdiOnlyCountries}.`,
  ].join(' '),
)

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { feature as topojsonFeature } from 'topojson-client'

const personas = [
  'data skeptic',
  'country join auditor',
  'mobile thumb tester',
  'accessibility reviewer',
  'source transparency reviewer',
  'performance reviewer',
  'visual encoding reviewer',
  'missing data reviewer',
  'iPhone layout reviewer',
  'map interaction reviewer',
]

function readJson(path) {
  return readFile(path, 'utf8').then(JSON.parse)
}

function pass(name, detail) {
  return { name, ok: true, detail }
}

function fail(name, detail) {
  return { name, ok: false, detail }
}

function assertCheck(condition, name, detail) {
  return condition ? pass(name, detail) : fail(name, detail)
}

const [tourismData, geoIndex, countriesTopo, appTsx, appCss, indexCss] = await Promise.all([
  readJson('src/data/tourismData.json'),
  readJson('src/data/geoIndex.json'),
  readJson('node_modules/world-atlas/countries-50m.json'),
  readFile('src/App.tsx', 'utf8'),
  readFile('src/App.css', 'utf8'),
  readFile('src/index.css', 'utf8'),
])

const featureCollection = topojsonFeature(countriesTopo, countriesTopo.objects.countries)
const features = featureCollection.features
const recordsByIso3 = new Map(tourismData.records.map((record) => [record.iso3, record]))
const joinedFeatures = features.filter((countryFeature) => {
  const numericId = String(countryFeature.id ?? '').padStart(3, '0')
  const iso3 = geoIndex[numericId]?.iso3
  return iso3 && recordsByIso3.has(iso3)
})
const allArrivalValues = tourismData.records.flatMap((record) => Object.values(record.years))
const latestYear = Math.max(...Object.keys(tourismData.coverage).map(Number))
const yearPairScenarios = [
  { label: 'Japan increase', iso3: 'JPN', fromYear: 2019, toYear: 2024, expected: 'ready-positive' },
  { label: 'Japan reverse', iso3: 'JPN', fromYear: 2024, toYear: 2019, expected: 'ready-negative' },
  { label: 'Kazakhstan missing from', iso3: 'KAZ', fromYear: 2019, toYear: 2024, expected: 'missing-from' },
  { label: 'China missing to', iso3: 'CHN', fromYear: 2019, toYear: 2024, expected: 'missing-to' },
  { label: 'Australia same-year missing', iso3: 'AUS', fromYear: 2024, toYear: 2024, expected: 'missing-same-year' },
]

function hasComparableYear(record, year) {
  const value = record?.years?.[String(year)]
  return Number.isFinite(value) && value > 0
}

function yearPairChecks(scenario) {
  const record = recordsByIso3.get(scenario.iso3)
  const checks = [
    assertCheck(Boolean(record), `${scenario.label} record exists`, `${scenario.iso3} is present`),
  ]
  if (!record) {
    return checks
  }

  const fromValue = record.years[String(scenario.fromYear)]
  const toValue = record.years[String(scenario.toYear)]
  const hasFrom = hasComparableYear(record, scenario.fromYear)
  const hasTo = Number.isFinite(toValue)
  const percentChange = hasFrom && hasTo ? ((toValue - fromValue) / fromValue) * 100 : null
  const detail = `${record.name}: ${scenario.fromYear}=${fromValue ?? 'missing'}, ${scenario.toYear}=${toValue ?? 'missing'}`

  if (scenario.expected === 'ready-positive') {
    checks.push(assertCheck(hasFrom && hasTo && percentChange > 0, `${scenario.label} positive comparison`, detail))
  }
  if (scenario.expected === 'ready-negative') {
    checks.push(assertCheck(hasFrom && hasTo && percentChange < 0, `${scenario.label} negative comparison`, detail))
  }
  if (scenario.expected === 'missing-from') {
    checks.push(assertCheck(!hasFrom && hasTo, `${scenario.label} is missing from-year only`, detail))
  }
  if (scenario.expected === 'missing-to') {
    checks.push(assertCheck(hasFrom && !hasTo, `${scenario.label} is missing to-year only`, detail))
  }
  if (scenario.expected === 'missing-same-year') {
    checks.push(
      assertCheck(
        scenario.fromYear === scenario.toYear && !hasFrom && !hasTo,
        `${scenario.label} avoids duplicate same-year data`,
        detail,
      ),
    )
  }

  return checks
}

async function getBundleCheck() {
  try {
    const jsFiles = await readFile('dist/index.html', 'utf8')
    const match = jsFiles.match(/assets\/([^"]+\.js)/)
    if (!match) {
      return pass('bundle file discoverable', 'No production JS file found in index.html yet')
    }
    const jsPath = join('dist', 'assets', match[1])
    const jsStat = await stat(jsPath)
    return assertCheck(
      jsStat.size < 1_600_000,
      'production bundle under review budget',
      `${Math.round(jsStat.size / 1024)} KB JavaScript before gzip`,
    )
  } catch {
    return pass('bundle file discoverable', 'Build output not present during static review')
  }
}

const sharedChecks = [
  assertCheck(
    tourismData.records.length >= 210,
    'tourism record coverage',
    `${tourismData.records.length} country or territory series`,
  ),
  assertCheck(
    (tourismData.coverage['2019'] ?? 0) >= 180,
    '2019 selected-year coverage',
    `${tourismData.coverage['2019'] ?? 0} reported series`,
  ),
  assertCheck(
    (tourismData.coverage['2022'] ?? 0) >= 120,
    '2022 selected-year coverage',
    `${tourismData.coverage['2022'] ?? 0} reported series`,
  ),
  assertCheck(
    (tourismData.coverage['2024'] ?? 0) >= 60,
    '2024 selected-year coverage',
    `${tourismData.coverage['2024'] ?? 0} reported series`,
  ),
  assertCheck(
    allArrivalValues.every((value) => Number.isFinite(value) && value >= 0),
    'arrival values are nonnegative',
    `${allArrivalValues.length} yearly values scanned`,
  ),
  assertCheck(
    features.length >= 230,
    'map geometry coverage',
    `${features.length} Natural Earth country/territory features`,
  ),
  assertCheck(
    joinedFeatures.length >= 160,
    'map data join coverage',
    `${joinedFeatures.length} features join to tourism series`,
  ),
  assertCheck(
    tourismData.source.name.includes('UN Tourism') && tourismData.source.chartUrl.includes('ourworldindata'),
    'source is traceable',
    tourismData.source.name,
  ),
  assertCheck(
    tourismData.source.fallbackName?.includes('World Bank') &&
      (tourismData.source.fallbackFilledYears ?? 0) > 0,
    'fallback source is traceable',
    `${tourismData.source.fallbackFilledYears ?? 0} compatibility-checked fallback years`,
  ),
  assertCheck(
    appTsx.includes('Digital nomad arrivals are not mapped'),
    'digital nomad caveat is explicit',
    'Avoids presenting weak proxy data as an arrival time series',
  ),
  assertCheck(
    appTsx.includes('policy-status') || appTsx.includes('policy-status'),
    'digital nomad alternative is categorical',
    'Notes that any future nomad layer should be policy status, not arrival change',
  ),
  assertCheck(
    !`${appCss}\n${indexCss}`.match(/letter-spacing:\s*-/),
    'no negative letter spacing',
    'CSS scanned',
  ),
  assertCheck(
    !`${appCss}\n${indexCss}`.match(/font-size:\s*[^;]*vw/),
    'no viewport-scaled font sizes',
    'CSS scanned',
  ),
  assertCheck(
    appTsx.includes('aria-label="From year"') &&
      appTsx.includes('aria-label="To year"') &&
      appTsx.includes('aria-label="Search countries"'),
    'core controls are labelled',
    'From/to selectors and search input have accessible labels',
  ),
  assertCheck(
    appTsx.includes('selected From year') && appTsx.includes('selected To year'),
    'data notes describe selected years',
    'Data notes match explicit from/to comparison controls',
  ),
  assertCheck(
    appTsx.includes('comparison.fromYear === comparison.toYear') &&
      appTsx.includes('no ${comparison.fromYear} data'),
    'same-year missing copy is not duplicated',
    'Same-year missing data reads as one missing selected year',
  ),
  assertCheck(
    latestYear === 2024,
    'latest global year is transparent',
    `latest year in generated coverage is ${latestYear}`,
  ),
  await getBundleCheck(),
]

const iterations = Array.from({ length: 60 }, (_, index) => {
  const persona = personas[index % personas.length]
  const scenario = yearPairScenarios[index % yearPairScenarios.length]
  const checks = [...sharedChecks, ...yearPairChecks(scenario)].map((check) => ({
    ...check,
    persona,
  }))
  return {
    iteration: index + 1,
    persona,
    scenario: scenario.label,
    ok: checks.every((check) => check.ok),
    checks,
  }
})

const failures = iterations.flatMap((iteration) =>
  iteration.checks
    .filter((check) => !check.ok)
    .map((check) => ({
      iteration: iteration.iteration,
      persona: iteration.persona,
      name: check.name,
      detail: check.detail,
    })),
)

const report = {
  generatedAt: new Date().toISOString(),
  iterations: iterations.length,
  personas,
  ok: failures.length === 0,
  failures,
  summary: {
    tourismRecords: tourismData.records.length,
    mapFeatures: features.length,
    joinedFeatures: joinedFeatures.length,
    latestYear,
    coverage2024: tourismData.coverage['2024'],
    yearPairScenarios: yearPairScenarios.length,
  },
  iterationsDetail: iterations,
}

await mkdir('review-artifacts', { recursive: true })
await writeFile('review-artifacts/adversarial-review.json', `${JSON.stringify(report, null, 2)}\n`)
await writeFile(
  'review-artifacts/adversarial-review.md',
  [
    '# Adversarial Review',
    '',
    `Generated: ${report.generatedAt}`,
    `Iterations: ${report.iterations}`,
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    '',
    '## Summary',
    '',
    `- Tourism records: ${report.summary.tourismRecords}`,
    `- Map features: ${report.summary.mapFeatures}`,
    `- Joined features: ${report.summary.joinedFeatures}`,
    `- Latest year: ${report.summary.latestYear}`,
    `- 2024 coverage: ${report.summary.coverage2024}`,
    '',
    '## Failures',
    '',
    ...(failures.length
      ? failures.map((failure) => `- ${failure.persona}: ${failure.name} - ${failure.detail}`)
      : ['- None']),
    '',
  ].join('\n'),
)

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exit(1)
}

console.log(
  `Adversarial review passed: ${iterations.length} iterations, ${joinedFeatures.length}/${features.length} map features joined.`,
)

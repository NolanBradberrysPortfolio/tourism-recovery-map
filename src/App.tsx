import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { feature as topojsonFeature } from 'topojson-client'
import { Info, Minus, Plus, RotateCcw, Search, X } from 'lucide-react'
import countriesTopo from 'world-atlas/countries-50m.json'
import geoIndexJson from './data/geoIndex.json'
import tourismDataJson from './data/tourismData.json'
import {
  baselineOptions,
  colorForComparison,
  compareCountry,
  describeComparison,
  formatCompact,
  formatNumber,
  formatPercent,
} from './dataUtils'
import type {
  BaselineKey,
  Comparison,
  CountryRecord,
  GeoIndexEntry,
  TourismDataset,
} from './types'
import './App.css'

type CountryFeature = Feature<Geometry, GeoJsonProperties> & {
  id?: string | number
}

type SelectedCountry = {
  iso3: string
  name: string
}

type SearchCountry = {
  iso3: string
  name: string
  sourceName: string
  officialName: string
  region: string
  subregion: string
  record: CountryRecord | null
  isMapped: boolean
}

const MAP_WIDTH = 1000
const MAP_HEIGHT = 560
const tourismData = tourismDataJson as unknown as TourismDataset
const geoIndex = geoIndexJson as Record<string, GeoIndexEntry>
const recordsByIso3 = new Map(tourismData.records.map((record) => [record.iso3, record]))
const countryFeatureCollection = topojsonFeature(
  countriesTopo as never,
  (countriesTopo as { objects: { countries: unknown } }).objects.countries as never,
) as unknown as FeatureCollection
const countryFeatures = countryFeatureCollection.features as CountryFeature[]
const projection = geoEqualEarth().fitExtent(
  [
    [8, 8],
    [MAP_WIDTH - 8, MAP_HEIGHT - 8],
  ],
  countryFeatureCollection,
)
const pathGenerator = geoPath(projection)
const latestGlobalYear = Math.max(
  ...Object.keys(tourismData.coverage)
    .map(Number)
    .filter(Number.isFinite),
)
const searchAliases: Record<string, string[]> = {
  ARE: ['uae', 'emirates'],
  CIV: ['cote d ivoire', 'cote divoire', 'ivory coast'],
  COD: ['dr congo', 'drc', 'democratic republic of congo'],
  COG: ['republic of congo', 'congo brazzaville'],
  CZE: ['czechia', 'czech republic'],
  GBR: ['uk', 'great britain', 'britain', 'england'],
  KOR: ['south korea', 'korea', 'republic of korea'],
  PRK: ['north korea', 'dprk'],
  STP: ['sao tome', 'sao tome and principe'],
  TUR: ['turkey'],
  USA: ['us', 'usa', 'america', 'united states'],
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function getNumericId(countryFeature: CountryFeature): string {
  return String(countryFeature.id ?? '').padStart(3, '0')
}

function getFeatureSummary(countryFeature: CountryFeature) {
  const numericId = getNumericId(countryFeature)
  const geoEntry = geoIndex[numericId]
  const iso3 = geoEntry?.iso3 ?? ''
  const record = iso3 ? recordsByIso3.get(iso3) : undefined
  const name =
    record?.name ??
    geoEntry?.name ??
    String(countryFeature.properties?.name ?? 'Unmatched country')

  return { numericId, iso3, name, record }
}

const mappedIso3Set = new Set(
  countryFeatures.flatMap((countryFeature) => {
    const { iso3 } = getFeatureSummary(countryFeature)
    const path = pathGenerator(countryFeature)
    return iso3 && path ? [iso3] : []
  }),
)

const searchCountries = [...tourismData.records, ...Object.values(geoIndex)].reduce(
  (countries, entry) => {
    if (!entry.iso3) {
      return countries
    }
    const record = recordsByIso3.get(entry.iso3) ?? null
    const existing = countries.get(entry.iso3)
    if (existing) {
      existing.isMapped = existing.isMapped || mappedIso3Set.has(entry.iso3)
      return countries
    }
    countries.set(entry.iso3, {
      iso3: entry.iso3,
      name: record?.name ?? entry.name,
      sourceName: record?.sourceName ?? entry.name,
      officialName: record?.officialName ?? entry.officialName,
      region: record?.region ?? entry.region,
      subregion: record?.subregion ?? entry.subregion,
      record,
      isMapped: mappedIso3Set.has(entry.iso3),
    })
    return countries
  },
  new Map<string, SearchCountry>(),
)

const searchableCountries = [...searchCountries.values()].sort((a, b) =>
  a.name.localeCompare(b.name),
)
const unmappedDataRecords = tourismData.records.filter((record) => !mappedIso3Set.has(record.iso3))

function getComparisonForFeature(
  countryFeature: CountryFeature,
  baseline: BaselineKey,
): Comparison | null {
  const { record } = getFeatureSummary(countryFeature)
  return record ? compareCountry(record, baseline) : null
}

function getSearchScore(country: SearchCountry, query: string): number {
  const value = normalizeSearchText(query)
  const name = normalizeSearchText(country.name)
  const sourceName = normalizeSearchText(country.sourceName)
  const officialName = normalizeSearchText(country.officialName)
  const iso3 = country.iso3.toLowerCase()
  const aliases = (searchAliases[country.iso3] ?? []).map(normalizeSearchText)
  if (!value) {
    return Number.POSITIVE_INFINITY
  }
  if (iso3 === value || name === value || sourceName === value || aliases.includes(value)) {
    return 0
  }
  if (
    iso3.startsWith(value) ||
    name.startsWith(value) ||
    sourceName.startsWith(value) ||
    aliases.some((alias) => alias.startsWith(value))
  ) {
    return 1
  }
  if (
    officialName.startsWith(value) ||
    name.split(' ').some((part) => part.startsWith(value)) ||
    sourceName.split(' ').some((part) => part.startsWith(value)) ||
    officialName.split(' ').some((part) => part.startsWith(value))
  ) {
    return 2
  }
  if (name.includes(value) || sourceName.includes(value) || officialName.includes(value)) {
    return 3
  }
  return Number.POSITIVE_INFINITY
}

function comparisonValueLabel(comparison: Comparison): string {
  if (comparison.percentChange !== null) {
    return formatPercent(comparison.percentChange)
  }
  return 'No comparison'
}

function mapFillForComparison(comparison: Comparison | null): string {
  if (!comparison) {
    return 'url(#no-series-pattern)'
  }
  if (comparison.percentChange === null) {
    return 'url(#no-comparison-pattern)'
  }
  return colorForComparison(comparison)
}

function baselineValueLabel(comparison: Comparison): string {
  if (comparison.baselineValue !== null && comparison.baselineYear) {
    return `${formatCompact(comparison.baselineValue)} in ${comparison.baselineYear}`
  }
  if (comparison.baselineYear) {
    return `No ${comparison.baselineYear} data`
  }
  return 'No prior year'
}

function sourceLabelForYear(record: CountryRecord, year: number | null): string {
  if (year === null) {
    return 'No source'
  }
  if (record.years[String(year)] === undefined) {
    return 'No source'
  }
  const filledSource = record.filledYears?.[String(year)]
  if (filledSource) {
    return filledSource
  }
  if (record.sourceBlend === 'world-bank-wdi-only') {
    return 'World Bank WDI'
  }
  return 'OWID / UN Tourism'
}

function compactFilledYears(record: CountryRecord): string {
  const years = Object.keys(record.filledYears ?? {}).sort()
  if (years.length <= 4) {
    return years.join(', ')
  }
  return `${years.slice(0, 3).join(', ')} plus ${years.length - 3} more`
}

function fallbackAuditLabel(record: CountryRecord): string {
  const filledYears = compactFilledYears(record)
  const compatibility = record.fallbackCompatibility
  if (!compatibility) {
    return filledYears
  }
  const maxDifference = formatPercent(compatibility.maxRelativeDifference * 100)
  const overlapLabel =
    compatibility.overlappingYears === 1 ? '1 overlap' : `${compatibility.overlappingYears} overlaps`
  return `${filledYears}; ${overlapLabel}, max source difference ${maxDifference}`
}

function searchSourceLabel(country: SearchCountry): string {
  const { record } = country
  if (!record) {
    return 'no tourism series in source data'
  }

  const sourceLabel =
    record.sourceBlend === 'owid-un-tourism-plus-compatible-wdi'
      ? 'OWID/UN + WDI fill'
      : sourceLabelForYear(record, record.latestYear)
  return `${country.isMapped ? 'latest' : 'not drawn; latest'} ${record.latestYear}; ${sourceLabel}`
}

function recordSourceNote(record: CountryRecord): string {
  if (record.sourceBlend === 'owid-un-tourism-plus-compatible-wdi') {
    return `; WDI fallback years ${compactFilledYears(record)}`
  }
  if (record.sourceBlend === 'world-bank-wdi-only') {
    return '; World Bank WDI only'
  }
  return ''
}

function statusLabelForComparison(comparison: Comparison | null): string {
  if (!comparison) {
    return 'no tourism series'
  }
  if (comparison.status === 'same-year') {
    return 'same latest and comparison year'
  }
  if (comparison.status === 'missing-baseline') {
    return comparison.baselineYear ? `no ${comparison.baselineYear} comparison` : 'no comparison'
  }
  if (comparison.status === 'missing-latest') {
    return 'no latest data'
  }
  return comparison.percentChange === null ? 'no comparison' : comparisonValueLabel(comparison)
}

function CountryMap({
  baseline,
  selected,
  onSelect,
}: {
  baseline: BaselineKey
  selected: SelectedCountry | null
  onSelect: (country: SelectedCountry) => void
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)
  const draggedRef = useRef(false)
  const selectedFeature = selected
    ? countryFeatures.find((countryFeature) => getFeatureSummary(countryFeature).iso3 === selected.iso3)
    : null
  const selectedCentroid = selectedFeature ? pathGenerator.centroid(selectedFeature) : null
  const focusX = selectedCentroid?.[0] ?? MAP_WIDTH / 2
  const focusY = selectedCentroid?.[1] ?? MAP_HEIGHT / 2
  const effectiveZoom = selectedFeature ? Math.max(zoom, 1.45) : zoom
  const transform = `translate(${MAP_WIDTH / 2 + pan.x} ${MAP_HEIGHT / 2 + pan.y}) scale(${effectiveZoom}) translate(${-focusX} ${-focusY})`
  const getSvgDelta = (deltaX: number, deltaY: number) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) {
      return { x: deltaX, y: deltaY }
    }
    return {
      x: (deltaX * MAP_WIDTH) / bounds.width,
      y: (deltaY * MAP_HEIGHT) / bounds.height,
    }
  }
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    draggedRef.current = false
  }
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) {
      draggedRef.current = true
    }
    const delta = getSvgDelta(deltaX, deltaY)
    setPan({ x: drag.panX + delta.x, y: drag.panY + delta.y })
  }
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
      window.setTimeout(() => {
        draggedRef.current = false
      }, 0)
    }
  }

  return (
    <>
      <svg
        className="world-map"
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMin meet"
        role="img"
        aria-label="World map of tourism arrival change by country"
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <pattern id="no-comparison-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#d8dde5" />
            <path d="M-2 8 L8 -2 M2 10 L10 2" stroke="#7d8794" strokeWidth="1.2" />
          </pattern>
          <pattern id="no-series-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#cfd6df" />
            <circle cx="2" cy="2" r="0.9" fill="#8c97a6" />
            <circle cx="6" cy="6" r="0.9" fill="#8c97a6" />
          </pattern>
        </defs>
        <rect className="ocean" width={MAP_WIDTH} height={MAP_HEIGHT} rx="18" />
        <g className="country-layer" transform={transform}>
          {countryFeatures.map((countryFeature, index) => {
            const summary = getFeatureSummary(countryFeature)
            const comparison = getComparisonForFeature(countryFeature, baseline)
            const isSelected = selected?.iso3 === summary.iso3
            const isStale = Boolean(summary.record && summary.record.latestYear < latestGlobalYear)
            const path = pathGenerator(countryFeature)
            if (!path) {
              return null
            }

            const selectCountry = () => {
              if (draggedRef.current) {
                return
              }
              if (summary.iso3) {
                onSelect({ iso3: summary.iso3, name: summary.name })
              }
            }

            return (
              <path
                aria-hidden="true"
                className={[
                  'country-path',
                  comparison ? 'has-data' : 'missing-data',
                  comparison?.status === 'same-year' ? 'same-year-data' : '',
                  comparison?.percentChange === null ? 'missing-comparison' : '',
                  isStale ? 'stale-data' : '',
                  isSelected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                d={path}
                fill={mapFillForComparison(comparison)}
                key={`${summary.numericId}-${index}`}
                onClick={selectCountry}
              >
                <title>
                  {`${summary.name}: ${statusLabelForComparison(comparison)}${
                    isStale ? `; latest year ${summary.record?.latestYear}` : ''
                  }${summary.record ? recordSourceNote(summary.record) : ''}`}
                </title>
              </path>
            )
          })}
        </g>
      </svg>

      <div className="map-tools" aria-label="Map zoom controls">
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          onClick={() => setZoom((value) => Math.min(2.2, Number((value + 0.25).toFixed(2))))}
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}
        >
          <Minus size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Reset map zoom"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          <RotateCcw size={17} />
        </button>
      </div>
    </>
  )
}

function DetailPanel({
  selected,
  record,
  comparison,
  isMapped,
  onClose,
}: {
  selected: SelectedCountry
  record: CountryRecord | null
  comparison: Comparison | null
  isMapped: boolean
  onClose: () => void
}) {
  if (!record || !comparison) {
    return (
      <aside className="detail-panel" aria-live="polite">
        <button className="icon-button panel-close" type="button" onClick={onClose} aria-label="Close country details">
          <X size={17} />
        </button>
        <div className="country-heading">
          <p className="eyebrow">No tourism series</p>
          <h2>{selected.name}</h2>
        </div>
        <p className="empty-copy">
          No matching arrivals series is published in the OWID/UN Tourism or World Bank WDI source data.
        </p>
      </aside>
    )
  }
  const hasPercentChange = comparison.percentChange !== null
  const primaryValue = hasPercentChange
    ? comparisonValueLabel(comparison)
    : formatCompact(comparison.latestValue)
  const primaryNote = hasPercentChange
    ? describeComparison(comparison)
    : `${comparison.latestYear} arrivals; ${describeComparison(comparison)}`
  const baselineLabel = comparison.baselineYear ?? 'selected year'

  return (
    <aside className="detail-panel" aria-live="polite">
      <button className="icon-button panel-close" type="button" onClick={onClose} aria-label="Close country details">
        <X size={17} />
      </button>
      <div className="country-heading">
        <p className="eyebrow">
          {record.iso3} / {record.region}
        </p>
        <h2>{record.name}</h2>
      </div>

      <div className={`primary-stat ${hasPercentChange ? '' : 'latest-primary'}`}>
        <span>{primaryValue}</span>
        <strong>{primaryNote}</strong>
      </div>

      <div className="detail-context" aria-label="Selected country map context">
        <span>Color compares latest arrivals with {baselineLabel} where available.</span>
        <span>No comparison means the selected year cannot be calculated.</span>
        {record.sourceBlend === 'owid-un-tourism-plus-compatible-wdi' && (
          <span>Some missing years are filled from compatible World Bank WDI values.</span>
        )}
        {record.sourceBlend === 'world-bank-wdi-only' && (
          <span>This record uses World Bank WDI fallback data only.</span>
        )}
        {!isMapped && (
          <span>This data record is searchable but not separately drawn by the base map geometry.</span>
        )}
      </div>

      <div className="stat-grid">
        <div>
          <span>Latest</span>
          <strong>
            {formatCompact(comparison.latestValue)} in {comparison.latestYear}
          </strong>
          <small>{sourceLabelForYear(record, comparison.latestYear)}</small>
        </div>
        <div>
          <span>Compare with</span>
          <strong>{baselineValueLabel(comparison)}</strong>
          <small>{sourceLabelForYear(record, comparison.baselineYear)}</small>
        </div>
        <div>
          <span>Change</span>
          <strong>{formatNumber(comparison.absoluteChange)}</strong>
        </div>
        <div>
          <span>Latest year</span>
          <strong>{record.latestYear}</strong>
        </div>
      </div>
    </aside>
  )
}

function Legend({ baseline }: { baseline: BaselineKey }) {
  const baselineLabel = baseline === 'prior' ? 'prior year' : baseline

  return (
    <div className="legend" aria-label="Color legend">
      <div className="legend-heading">
        <strong>% change</strong>
        <span>latest vs {baselineLabel}</span>
      </div>
      <div className="legend-scale">
        <span>-100%</span>
        <div className="legend-ramp">
          <i />
        </div>
        <span>+100%</span>
      </div>
      <div className="legend-states">
        <span>
          <i className="state-swatch no-comparison" aria-hidden="true" /> No baseline
        </span>
        <span>
          <i className="state-swatch same-year" aria-hidden="true" /> Same year
        </span>
        <span>
          <i className="state-swatch no-series" aria-hidden="true" /> No series
        </span>
        <span>
          <i className="state-swatch stale-year" aria-hidden="true" /> Older latest year
        </span>
      </div>
      <p className="legend-note">
        Values beyond +/-100% are clipped to the color endpoints.
        {baseline === '2024' ? ' The 2024 view mostly shows coverage, not recovery.' : ''}
      </p>
    </div>
  )
}

function SourcePanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const compatibleFallbackRecords = tourismData.records.filter(
    (record) => record.sourceBlend === 'owid-un-tourism-plus-compatible-wdi',
  )
  const wdiOnlyRecords = tourismData.records.filter(
    (record) => record.sourceBlend === 'world-bank-wdi-only',
  )

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <div className="modal-backdrop">
      <aside
        className="source-panel"
        aria-label="Data notes"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose()
          }
          if (event.key === 'Tab' && dialogRef.current) {
            const focusable = Array.from(
              dialogRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ),
            )
            const first = focusable[0]
            const last = focusable.at(-1)
            if (!first || !last) {
              return
            }
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }
        }}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close data notes">
          <X size={18} />
        </button>
        <h2>Data Notes</h2>
        <p>
          {tourismData.source.description} Each country uses its latest reported year;
          {` ${tourismData.coverage['2024'] ?? 0}`} countries report 2024.
        </p>
        {tourismData.source.fallbackFilledYears !== undefined && (
          <p>
            World Bank WDI adds {tourismData.source.fallbackFilledYears} missing years
            after per-country source agreement checks. Countries with fewer than 3
            overlapping source years can fill only the 2019, 2022, or 2024
            comparison years. {tourismData.source.fallbackOnlyCountries ?? 0}
            {' '}country records use WDI only.
          </p>
        )}
        {compatibleFallbackRecords.length > 0 && (
          <p className="source-audit">
            Compatible WDI fills:{' '}
            {compatibleFallbackRecords
              .map((record) => `${record.name} (${fallbackAuditLabel(record)})`)
              .join('; ')}.
          </p>
        )}
        {wdiOnlyRecords.length > 0 && (
          <p className="source-audit">
            WDI-only records: {wdiOnlyRecords.map((record) => record.name).join(', ')}.
          </p>
        )}
        {unmappedDataRecords.length > 0 && (
          <p className="source-audit">
            Searchable records not separately drawn by the base map:{' '}
            {unmappedDataRecords.map((record) => record.name).join(', ')}.
          </p>
        )}
        <ul>
          <li>Arrivals are trips, not unique people.</li>
          <li>Country methods differ, so exact comparability varies.</li>
          <li>Hatching means the selected comparison cannot be calculated.</li>
          <li>Dotted shapes are map geographies without a matching tourism series.</li>
          <li>Dashed borders mean the country&apos;s latest reported year is before 2024.</li>
          <li>World Bank fallback years are used only when overlapping values match the primary series within 2%.</li>
          <li>Some small countries and territories in the source are searchable even when not separately drawn on this map.</li>
          <li>
            Digital nomad arrivals are not mapped because no authoritative global
            country-level destination time series was available; a policy-status
            overlay would be a separate, categorical layer.
          </li>
        </ul>
        <div className="source-links">
          <a href={tourismData.source.chartUrl} target="_blank" rel="noreferrer">
            OWID data
          </a>
          <a href={tourismData.source.originalSourceUrl} target="_blank" rel="noreferrer">
            UN Tourism
          </a>
          {tourismData.source.fallbackDataUrl && (
            <a href={tourismData.source.fallbackDataUrl} target="_blank" rel="noreferrer">
              World Bank WDI
            </a>
          )}
        </div>
      </aside>
    </div>
  )
}

function CountryDataList({ baseline }: { baseline: BaselineKey }) {
  return (
    <section className="sr-only" aria-label="Country data list">
      <h2>Country Data List</h2>
      <ul>
        {tourismData.records.map((record) => {
          const comparison = compareCountry(record, baseline)
          return (
            <li key={record.iso3}>
              {record.name}: latest {formatCompact(comparison.latestValue)} in {comparison.latestYear};
              {` ${describeComparison(comparison)}`}; compare with {baselineValueLabel(comparison)}.
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function App() {
  const [baseline, setBaseline] = useState<BaselineKey>('2019')
  const [selected, setSelected] = useState<SelectedCountry | null>(null)
  const [query, setQuery] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [selectionStatus, setSelectionStatus] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const infoButtonRef = useRef<HTMLButtonElement | null>(null)

  const selectedRecord = selected ? recordsByIso3.get(selected.iso3) ?? null : null
  const selectedComparison = selectedRecord ? compareCountry(selectedRecord, baseline) : null

  const trimmedQuery = query.trim()
  const searchResults = useMemo(() => {
    const normalized = trimmedQuery
    if (normalized.length < 2) {
      return []
    }
    return searchableCountries
      .map((country) => ({ country, score: getSearchScore(country, normalized) }))
      .filter((result) => Number.isFinite(result.score))
      .sort((a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name))
      .slice(0, 8)
      .map((result) => result.country)
  }, [trimmedQuery])
  const showSearchPanel = trimmedQuery.length >= 2
  const activeSearchResult =
    searchResults[Math.min(activeSearchIndex, Math.max(searchResults.length - 1, 0))]

  const selectCountry = (country: SelectedCountry) => {
    const record = recordsByIso3.get(country.iso3)
    const comparison = record ? compareCountry(record, baseline) : null
    setSelected(country)
    setSelectionStatus(
      record && comparison
        ? `Selected ${record.name}. Latest arrivals ${formatCompact(comparison.latestValue)} in ${comparison.latestYear}. ${describeComparison(comparison)}.`
        : `Selected ${country.name}. No tourism series is published in this dataset.`,
    )
  }

  const selectSearchCountry = (country: SearchCountry) => {
    selectCountry({ iso3: country.iso3, name: country.name })
    setQuery('')
    setActiveSearchIndex(0)
  }

  const matchedFeatureCount = useMemo(
    () =>
      countryFeatures.filter((countryFeature) => {
        const { record, iso3 } = getFeatureSummary(countryFeature)
        return Boolean(record && mappedIso3Set.has(iso3))
      }).length,
    [],
  )

  return (
    <main className="app-shell">
      <div className="app-content" aria-hidden={infoOpen}>
      <header className="topbar">
        <div className="brand-block">
          <h1>Tourism Recovery Map</h1>
          <p>International arrivals, latest year vs selected comparison</p>
        </div>

        <div className="control-row" aria-label="Map controls">
          <label className="select-control">
            <span>Compare with</span>
            <select
              aria-label="Comparison year"
              value={baseline}
              onChange={(event) => setBaseline(event.target.value as BaselineKey)}
            >
              {baselineOptions.map((option) => (
                <option value={option.key} key={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="search-control">
            <Search size={17} aria-hidden="true" />
            <input
              aria-controls="country-search-results"
              aria-expanded={showSearchPanel}
              aria-activedescendant={
                activeSearchResult ? `country-option-${activeSearchResult.iso3}` : undefined
              }
              aria-label="Search countries"
              aria-autocomplete="list"
              placeholder="Search"
              role="combobox"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveSearchIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && searchResults.length > 0) {
                  event.preventDefault()
                  setActiveSearchIndex((index) => (index + 1) % searchResults.length)
                }
                if (event.key === 'ArrowUp' && searchResults.length > 0) {
                  event.preventDefault()
                  setActiveSearchIndex((index) => (index - 1 + searchResults.length) % searchResults.length)
                }
                if (event.key === 'Enter' && activeSearchResult) {
                  event.preventDefault()
                  selectSearchCountry(activeSearchResult)
                }
                if (event.key === 'Escape') {
                  setQuery('')
                  setActiveSearchIndex(0)
                }
              }}
            />
            {query && (
              <button
                className="search-clear"
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <X size={16} />
              </button>
            )}
            {showSearchPanel && (
              <div className="search-results" id="country-search-results" role="listbox">
                {searchResults.length > 0 ? (
                  searchResults.map((country, index) => (
                    <div
                      key={country.iso3}
                      id={`country-option-${country.iso3}`}
                      aria-label={`${country.name} country search option`}
                      aria-selected={index === activeSearchIndex}
                      className={`search-option ${country.record ? '' : 'no-series-option'}`}
                      onClick={() => selectSearchCountry(country)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                    >
                      <span>
                        <strong>{country.name}</strong>
                        <small>
                          {country.iso3} / {country.region} / {searchSourceLabel(country)}
                        </small>
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="search-empty" role="status">
                    No matching country
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="sr-only" role="status">
            {selectionStatus}
          </p>

          <button
            className="icon-button"
            type="button"
            ref={infoButtonRef}
            aria-label="Open data notes"
            onClick={() => setInfoOpen(true)}
          >
            <Info size={18} />
          </button>
        </div>
      </header>

      <section
        className={`map-stage ${selected ? 'has-selection' : ''}`}
        aria-label="Country tourism change map"
      >
        <CountryMap baseline={baseline} selected={selected} onSelect={selectCountry} />

        <div className="map-overlay">
          <Legend baseline={baseline} />
          <div className="coverage-strip">
            <span>{tourismData.records.length} data series</span>
            <span>{matchedFeatureCount} mapped country shapes</span>
            <span>{unmappedDataRecords.length} searchable not drawn</span>
            <span>{tourismData.coverage[String(latestGlobalYear)]} with {latestGlobalYear} data</span>
            <span>Others use latest reported year</span>
          </div>
        </div>

        {selected && (
          <DetailPanel
            selected={selected}
            record={selectedRecord}
            comparison={selectedComparison}
            isMapped={selected ? mappedIso3Set.has(selected.iso3) : false}
            onClose={() => {
              setSelected(null)
              setSelectionStatus('Country details closed.')
            }}
          />
        )}
      </section>
      <CountryDataList baseline={baseline} />
      </div>

      {infoOpen && (
        <SourcePanel
          onClose={() => {
            setInfoOpen(false)
            window.setTimeout(() => infoButtonRef.current?.focus(), 0)
          }}
        />
      )}
    </main>
  )
}

export default App

import { useEffect, useMemo, useState } from 'react'
import { GeoJSON, MapContainer, ZoomControl, useMap } from 'react-leaflet'
import type { Feature, FeatureCollection, GeoJsonObject, GeoJsonProperties, Geometry } from 'geojson'
import type { Layer, Path, PathOptions } from 'leaflet'
import { feature as topojsonFeature } from 'topojson-client'
import { Info, LocateFixed, Search, X } from 'lucide-react'
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

const tourismData = tourismDataJson as unknown as TourismDataset
const geoIndex = geoIndexJson as Record<string, GeoIndexEntry>
const recordsByIso3 = new Map(tourismData.records.map((record) => [record.iso3, record]))
const countryFeatureCollection = topojsonFeature(
  countriesTopo as never,
  (countriesTopo as { objects: { countries: unknown } }).objects.countries as never,
) as unknown as FeatureCollection
const countryFeatures = (
  countryFeatureCollection.features as CountryFeature[]
)

const latestGlobalYear = Math.max(
  ...Object.keys(tourismData.coverage)
    .map(Number)
    .filter(Number.isFinite),
)

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

function getComparisonForFeature(
  countryFeature: CountryFeature,
  baseline: BaselineKey,
): Comparison | null {
  const { record } = getFeatureSummary(countryFeature)
  return record ? compareCountry(record, baseline) : null
}

function styleCountry(countryFeature: CountryFeature, baseline: BaselineKey): PathOptions {
  const comparison = getComparisonForFeature(countryFeature, baseline)
  const hasData = comparison !== null

  return {
    color: hasData ? '#5e6876' : '#aeb6c2',
    fillColor: comparison ? colorForComparison(comparison) : '#d7dbe1',
    fillOpacity: hasData ? 0.86 : 0.45,
    opacity: 1,
    weight: 0.55,
  }
}

function FlyToSelectedCountry({ record }: { record: CountryRecord | null }) {
  const map = useMap()
  const lat = record?.latlng?.[0]
  const lng = record?.latlng?.[1]

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return
    }
    map.flyTo([lat as number, lng as number], Math.max(map.getZoom(), 4), {
      duration: 0.65,
    })
  }, [lat, lng, map, record?.iso3])

  return null
}

function Sparkline({ record }: { record: CountryRecord }) {
  const points = Object.entries(record.years)
    .map(([year, value]) => ({ year: Number(year), value }))
    .sort((a, b) => a.year - b.year)
  const minYear = points[0]?.year ?? 0
  const maxYear = points.at(-1)?.year ?? 1
  const values = points.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = Math.max(maxValue - minValue, 1)
  const yearRange = Math.max(maxYear - minYear, 1)
  const path = points
    .map((point) => {
      const x = ((point.year - minYear) / yearRange) * 100
      const y = 34 - ((point.value - minValue) / valueRange) * 30
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg className="sparkline" viewBox="0 0 100 38" role="img" aria-label="Arrival trend">
      <polyline points={path} />
    </svg>
  )
}

function DetailPanel({
  selected,
  record,
  comparison,
}: {
  selected: SelectedCountry
  record: CountryRecord | null
  comparison: Comparison | null
}) {
  if (!record || !comparison) {
    return (
      <aside className="detail-panel" aria-live="polite">
        <div className="country-heading">
          <p className="eyebrow">No tourism series</p>
          <h2>{selected.name}</h2>
        </div>
        <p className="empty-copy">
          No matching country-level arrival series is published in this dataset.
        </p>
      </aside>
    )
  }

  return (
    <aside className="detail-panel" aria-live="polite">
      <div className="country-heading">
        <p className="eyebrow">
          {record.iso3} · {record.region}
        </p>
        <h2>{record.name}</h2>
      </div>

      <div className="primary-stat">
        <span>{formatPercent(comparison.percentChange)}</span>
        <strong>{describeComparison(comparison)}</strong>
      </div>

      <div className="stat-grid">
        <div>
          <span>Latest</span>
          <strong>
            {formatCompact(comparison.latestValue)} in {comparison.latestYear}
          </strong>
        </div>
        <div>
          <span>Baseline</span>
          <strong>
            {comparison.baselineYear
              ? `${formatCompact(comparison.baselineValue)} in ${comparison.baselineYear}`
              : 'No data'}
          </strong>
        </div>
        <div>
          <span>Change</span>
          <strong>{formatNumber(comparison.absoluteChange)}</strong>
        </div>
        <div>
          <span>Series year</span>
          <strong>{record.latestYear}</strong>
        </div>
      </div>

      <Sparkline record={record} />
    </aside>
  )
}

function Legend() {
  return (
    <div className="legend" aria-label="Color legend">
      <span>Decrease</span>
      <div className="legend-ramp" />
      <span>Increase</span>
    </div>
  )
}

function SourcePanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="source-panel" aria-label="Data notes">
      <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close data notes">
        <X size={18} />
      </button>
      <h2>Data Notes</h2>
      <p>
        {tourismData.source.description} Latest global year in this build is {latestGlobalYear};
        2024 has {tourismData.coverage['2024'] ?? 0} reported countries.
      </p>
      <ul>
        {tourismData.source.notes.slice(0, 4).map((note) => (
          <li key={note}>{note}</li>
        ))}
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
      </div>
    </aside>
  )
}

function App() {
  const [baseline, setBaseline] = useState<BaselineKey>('2019')
  const [selected, setSelected] = useState<SelectedCountry>({
    iso3: 'USA',
    name: 'United States',
  })
  const [query, setQuery] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)

  const selectedRecord = recordsByIso3.get(selected.iso3) ?? null
  const selectedComparison = selectedRecord ? compareCountry(selectedRecord, baseline) : null

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized.length < 2) {
      return []
    }
    return tourismData.records
      .filter((record) => record.name.toLowerCase().includes(normalized))
      .slice(0, 8)
  }, [query])

  const matchedFeatureCount = useMemo(
    () =>
      countryFeatures.filter((countryFeature) => {
        const { record } = getFeatureSummary(countryFeature)
        return Boolean(record)
      }).length,
    [],
  )

  const handleFeature = (countryFeature: CountryFeature, layer: Layer) => {
    const summary = getFeatureSummary(countryFeature)
    const comparison = getComparisonForFeature(countryFeature, baseline)
    const tooltip = comparison
      ? `${summary.name}: ${formatPercent(comparison.percentChange)}`
      : `${summary.name}: no data`

    layer.bindTooltip(tooltip, {
      sticky: true,
      className: 'country-tooltip',
    })

    layer.on({
      click: () => {
        if (summary.iso3) {
          setSelected({ iso3: summary.iso3, name: summary.name })
        }
      },
      mouseout: () => {
        ;(layer as Path).setStyle(styleCountry(countryFeature, baseline))
      },
      mouseover: () => {
        ;(layer as Path).setStyle({
          color: '#16202f',
          fillOpacity: 0.96,
          weight: 1.25,
        })
      },
    })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1>Tourism Recovery Map</h1>
          <p>International arrivals, latest reported year vs selected baseline</p>
        </div>

        <div className="control-row" aria-label="Map controls">
          <label className="select-control">
            <span>Baseline</span>
            <select
              aria-label="Comparison baseline"
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
              aria-label="Search countries"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((record) => (
                  <button
                    key={record.iso3}
                    type="button"
                    aria-label={`Select ${record.name}`}
                    onClick={() => {
                      setSelected({ iso3: record.iso3, name: record.name })
                      setQuery('')
                    }}
                  >
                    <span>{record.name}</span>
                    <strong>{record.latestYear}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="icon-button"
            type="button"
            aria-label="Open data notes"
            onClick={() => setInfoOpen(true)}
          >
            <Info size={18} />
          </button>
        </div>
      </header>

      <section className="map-stage" aria-label="Country tourism change map">
        <MapContainer
          center={[18, 8]}
          zoom={2}
          minZoom={1}
          maxZoom={7}
          zoomControl={false}
          maxBounds={[
            [-86, -190],
            [86, 190],
          ]}
          className="map"
        >
          <GeoJSON
            key={baseline}
            data={countryFeatureCollection as GeoJsonObject}
            onEachFeature={handleFeature}
            style={(countryFeature) => styleCountry(countryFeature as CountryFeature, baseline)}
          />
          <FlyToSelectedCountry record={selectedRecord} />
          <ZoomControl position="bottomright" />
        </MapContainer>

        <div className="map-overlay">
          <Legend />
          <div className="coverage-strip">
            <LocateFixed size={15} aria-hidden="true" />
            <span>{matchedFeatureCount} mapped series</span>
            <span>{tourismData.coverage[String(latestGlobalYear)]} countries in {latestGlobalYear}</span>
          </div>
        </div>

        <DetailPanel selected={selected} record={selectedRecord} comparison={selectedComparison} />
      </section>

      {infoOpen && <SourcePanel onClose={() => setInfoOpen(false)} />}
    </main>
  )
}

export default App

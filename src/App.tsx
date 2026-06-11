import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent, TouchEvent } from 'react'
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { feature as topojsonFeature } from 'topojson-client'
import { Info, Minus, Plus, RotateCcw, Search, X } from 'lucide-react'
import countriesTopo from 'world-atlas/countries-50m.json'
import geoIndexJson from './data/geoIndex.json'
import tourismDataJson from './data/tourismData.json'
import {
  colorForComparison,
  compareCountry,
  describeComparison,
  formatCompact,
  formatNumber,
  formatPercent,
} from './dataUtils'
import type {
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
const yearOptions = Object.keys(tourismData.coverage)
  .map(Number)
  .filter(Number.isFinite)
  .sort((a, b) => a - b)
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

const supplementalCountryNotes: Record<string, { text: string; url: string; label: string }> = {
  CHN: {
    text:
      'China reports newer official 2024 inbound-tourism counts, but those national counts use a broader definition than the UN/OWID overnight-arrivals series used for this map, so they are shown as context instead of merged into the color scale.',
    url: 'https://english.www.gov.cn/archive/statistics/202505/19/content_WS682ae46ec6d0868f4e8f2aa6.html',
    label: 'China official 2024 context',
  },
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
  fromYear: number,
  toYear: number,
): Comparison | null {
  const { record } = getFeatureSummary(countryFeature)
  return record ? compareCountry(record, fromYear, toYear) : null
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

function yearValueLabel(value: number | null, year: number): string {
  if (value !== null) {
    return `${formatCompact(value)} in ${year}`
  }
  return `No ${year} data`
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
    return 'same from and to year'
  }
  if (comparison.status === 'missing-both') {
    if (comparison.fromYear === comparison.toYear) {
      return `no ${comparison.fromYear} data`
    }
    return `no ${comparison.fromYear} or ${comparison.toYear} data`
  }
  if (comparison.status === 'missing-from') {
    return `no ${comparison.fromYear} data`
  }
  if (comparison.status === 'missing-to') {
    return `no ${comparison.toYear} data`
  }
  return comparison.percentChange === null ? 'no comparison' : comparisonValueLabel(comparison)
}

function CountryMap({
  fromYear,
  toYear,
  selected,
  onSelect,
  onClearSelection,
}: {
  fromYear: number
  toYear: number
  selected: SelectedCountry | null
  onSelect: (country: SelectedCountry) => void
  onClearSelection: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const panRef = useRef(pan)
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<
    | {
        type: 'pan'
        pointerId: number
        startX: number
        startY: number
        startPan: { x: number; y: number }
      }
    | {
        type: 'pinch'
        startDistance: number
        startZoom: number
        startWorld: { x: number; y: number }
      }
    | null
  >(null)
  const tapTargetRef = useRef<
    | { type: 'country'; iso3: string; name: string }
    | { type: 'ocean' }
    | null
  >(null)
  const zoomRef = useRef(1)
  const focusRef = useRef<{ x: number; y: number } | null>({
    x: MAP_WIDTH / 2,
    y: MAP_HEIGHT / 2,
  })
  const draggedRef = useRef(false)
  const selectedFeature = selected
    ? countryFeatures.find((countryFeature) => getFeatureSummary(countryFeature).iso3 === selected.iso3)
    : null
  const selectedCentroid = selectedFeature ? pathGenerator.centroid(selectedFeature) : null
  const focusX = selectedCentroid?.[0] ?? MAP_WIDTH / 2
  const focusY = selectedCentroid?.[1] ?? MAP_HEIGHT / 2
  const effectiveZoom = selectedFeature ? Math.max(zoom, 1.45) : zoom
  const transform = `translate(${MAP_WIDTH / 2 + pan.x} ${MAP_HEIGHT / 2 + pan.y}) scale(${effectiveZoom}) translate(${-focusX} ${-focusY})`
  useEffect(() => {
    panRef.current = pan
  }, [pan])
  useEffect(() => {
    zoomRef.current = effectiveZoom
    focusRef.current = { x: focusX, y: focusY }
  }, [effectiveZoom, focusX, focusY])
  const clampZoom = (value: number) => Math.max(1, Math.min(2.8, value))
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
  const getSvgPoint = (clientX: number, clientY: number) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) {
      return { x: clientX, y: clientY }
    }
    return {
      x: ((clientX - bounds.left) * MAP_WIDTH) / bounds.width,
      y: ((clientY - bounds.top) * MAP_HEIGHT) / bounds.height,
    }
  }
  const getGesturePointers = () => [...activePointersRef.current.values()].slice(0, 2)
  const getDistance = (points: Array<{ x: number; y: number }>) =>
    Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  const getCenter = (points: Array<{ x: number; y: number }>) => ({
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  })
  const getWorldPoint = (svgPoint: { x: number; y: number }, gestureZoom: number) => {
    const focus = focusRef.current ?? { x: focusX, y: focusY }
    const currentPan = panRef.current
    return {
      x: (svgPoint.x - MAP_WIDTH / 2 - currentPan.x) / gestureZoom + focus.x,
      y: (svgPoint.y - MAP_HEIGHT / 2 - currentPan.y) / gestureZoom + focus.y,
    }
  }
  const setPanValue = (nextPan: { x: number; y: number }) => {
    panRef.current = nextPan
    setPan(nextPan)
  }
  const startPanGesture = (pointerId: number, point: { x: number; y: number }) => {
    gestureRef.current = {
      type: 'pan',
      pointerId,
      startX: point.x,
      startY: point.y,
      startPan: panRef.current,
    }
  }
  const startPinchGesture = () => {
    const points = getGesturePointers()
    if (points.length < 2) {
      return
    }
    const center = getCenter(points)
    const centerSvg = getSvgPoint(center.x, center.y)
    const startZoom = zoomRef.current
    gestureRef.current = {
      type: 'pinch',
      startDistance: Math.max(getDistance(points), 1),
      startZoom,
      startWorld: getWorldPoint(centerSvg, startZoom),
    }
    draggedRef.current = true
    tapTargetRef.current = null
  }
  const getTapTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return null
    }
    if (target.classList.contains('country-path')) {
      const iso3 = target.getAttribute('data-iso3')
      const name = target.getAttribute('data-country-name')
      return iso3 && name ? { type: 'country' as const, iso3, name } : null
    }
    if (target.classList.contains('ocean')) {
      return { type: 'ocean' as const }
    }
    return null
  }
  const applyTapTarget = (
    tapTarget: { type: 'country'; iso3: string; name: string } | { type: 'ocean' } | null,
  ) => {
    if (!tapTarget) {
      return
    }
    if (tapTarget.type === 'ocean') {
      if (selected) {
        onClearSelection()
      }
      return
    }
    if (selected?.iso3 === tapTarget.iso3) {
      onClearSelection()
      return
    }
    onSelect({ iso3: tapTarget.iso3, name: tapTarget.name })
  }
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch' || (event.pointerType === 'mouse' && event.button !== 0)) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    draggedRef.current = false
    tapTargetRef.current = activePointersRef.current.size === 1 ? getTapTarget(event.target) : null
    if (activePointersRef.current.size >= 2) {
      startPinchGesture()
      return
    }
    startPanGesture(event.pointerId, { x: event.clientX, y: event.clientY })
  }
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch') {
      return
    }
    if (!activePointersRef.current.has(event.pointerId)) {
      return
    }
    event.preventDefault()
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const gesture = gestureRef.current
    if (!gesture) {
      return
    }

    if (activePointersRef.current.size >= 2 && gesture.type === 'pinch') {
      const points = getGesturePointers()
      const center = getCenter(points)
      const centerSvg = getSvgPoint(center.x, center.y)
      const focus = focusRef.current ?? { x: focusX, y: focusY }
      const nextZoom = clampZoom(gesture.startZoom * (getDistance(points) / gesture.startDistance))
      const nextPan = {
        x: centerSvg.x - MAP_WIDTH / 2 - nextZoom * (gesture.startWorld.x - focus.x),
        y: centerSvg.y - MAP_HEIGHT / 2 - nextZoom * (gesture.startWorld.y - focus.y),
      }
      draggedRef.current = true
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      setPanValue(nextPan)
      return
    }

    if (gesture.type === 'pan' && gesture.pointerId === event.pointerId) {
      const deltaX = event.clientX - gesture.startX
      const deltaY = event.clientY - gesture.startY
      if (Math.abs(deltaX) + Math.abs(deltaY) > 5) {
        draggedRef.current = true
      }
      const delta = getSvgDelta(deltaX, deltaY)
      setPanValue({ x: gesture.startPan.x + delta.x, y: gesture.startPan.y + delta.y })
    }
  }
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch') {
      return
    }
    if (activePointersRef.current.has(event.pointerId)) {
      const shouldApplyTap =
        !draggedRef.current &&
        activePointersRef.current.size === 1 &&
        gestureRef.current?.type === 'pan'
      const tapTarget = shouldApplyTap ? tapTargetRef.current : null
      activePointersRef.current.delete(event.pointerId)
      event.currentTarget.releasePointerCapture(event.pointerId)
      const remainingPointers = [...activePointersRef.current.entries()]
      if (remainingPointers.length === 1) {
        const [pointerId, point] = remainingPointers[0]
        startPanGesture(pointerId, point)
      } else if (remainingPointers.length === 0) {
        gestureRef.current = null
        tapTargetRef.current = null
        applyTapTarget(tapTarget)
        window.setTimeout(() => {
          draggedRef.current = false
        }, 0)
      } else {
        startPinchGesture()
      }
    }
  }
  const getTouchPoints = (touches: TouchEvent<SVGSVGElement>['touches']) => {
    const points: Array<{ id: number; point: { x: number; y: number } }> = []
    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches[index]
      points.push({
        id: touch.identifier,
        point: { x: touch.clientX, y: touch.clientY },
      })
    }
    return points
  }
  const syncTouchPoints = (touches: TouchEvent<SVGSVGElement>['touches']) => {
    activePointersRef.current = new Map(
      getTouchPoints(touches).map((touch) => [touch.id, touch.point]),
    )
  }
  const startTouchGesture = (
    touches: TouchEvent<SVGSVGElement>['touches'],
    target: EventTarget | null,
  ) => {
    syncTouchPoints(touches)
    if (touches.length === 0) {
      return
    }
    draggedRef.current = false
    tapTargetRef.current = touches.length === 1 ? getTapTarget(target) : null
    if (touches.length >= 2) {
      startPinchGesture()
      return
    }
    const firstTouch = getTouchPoints(touches)[0]
    startPanGesture(firstTouch.id, firstTouch.point)
  }
  const onTouchStart = (event: TouchEvent<SVGSVGElement>) => {
    event.preventDefault()
    startTouchGesture(event.touches, event.target)
  }
  const onTouchMove = (event: TouchEvent<SVGSVGElement>) => {
    event.preventDefault()
    syncTouchPoints(event.touches)
    const gesture = gestureRef.current
    if (!gesture || event.touches.length === 0) {
      return
    }

    if (event.touches.length >= 2 && gesture.type === 'pinch') {
      const points = getGesturePointers()
      const center = getCenter(points)
      const centerSvg = getSvgPoint(center.x, center.y)
      const focus = focusRef.current ?? { x: focusX, y: focusY }
      const nextZoom = clampZoom(gesture.startZoom * (getDistance(points) / gesture.startDistance))
      const nextPan = {
        x: centerSvg.x - MAP_WIDTH / 2 - nextZoom * (gesture.startWorld.x - focus.x),
        y: centerSvg.y - MAP_HEIGHT / 2 - nextZoom * (gesture.startWorld.y - focus.y),
      }
      draggedRef.current = true
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      setPanValue(nextPan)
      return
    }

    if (event.touches.length === 1 && gesture.type === 'pan') {
      const touch = getTouchPoints(event.touches)[0]
      const deltaX = touch.point.x - gesture.startX
      const deltaY = touch.point.y - gesture.startY
      if (Math.abs(deltaX) + Math.abs(deltaY) > 5) {
        draggedRef.current = true
      }
      const delta = getSvgDelta(deltaX, deltaY)
      setPanValue({ x: gesture.startPan.x + delta.x, y: gesture.startPan.y + delta.y })
    }
  }
  const onTouchEnd = (event: TouchEvent<SVGSVGElement>) => {
    event.preventDefault()
    const previousSize = activePointersRef.current.size
    const shouldApplyTap =
      !draggedRef.current &&
      previousSize === 1 &&
      event.touches.length === 0 &&
      gestureRef.current?.type === 'pan'
    const tapTarget = shouldApplyTap ? tapTargetRef.current : null
    syncTouchPoints(event.touches)
    const remainingTouches = getTouchPoints(event.touches)
    if (remainingTouches.length >= 2) {
      startPinchGesture()
      return
    }
    if (remainingTouches.length === 1) {
      startPanGesture(remainingTouches[0].id, remainingTouches[0].point)
      return
    }
    gestureRef.current = null
    tapTargetRef.current = null
    applyTapTarget(tapTarget)
    window.setTimeout(() => {
      draggedRef.current = false
    }, 0)
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
        onTouchCancel={onTouchEnd}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
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
            const comparison = getComparisonForFeature(countryFeature, fromYear, toYear)
            const isSelected = selected?.iso3 === summary.iso3
            const isStale = Boolean(summary.record && summary.record.latestYear < toYear)
            const path = pathGenerator(countryFeature)
            if (!path) {
              return null
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
                data-country-name={summary.name}
                data-iso3={summary.iso3}
                fill={mapFillForComparison(comparison)}
                key={`${summary.numericId}-${index}`}
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
        {selected && (
          <button
            type="button"
            className="icon-button"
            aria-label="Close map details"
            onClick={onClearSelection}
          >
            <X size={17} />
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          onClick={() => setZoom((value) => clampZoom(Number((value + 0.25).toFixed(2))))}
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          onClick={() => setZoom((value) => clampZoom(Number((value - 0.25).toFixed(2))))}
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
        <div className="panel-actions">
          <button className="panel-action" type="button" onClick={onClose} aria-label="Close selected country details">
            <X size={16} />
            <span>Close details</span>
          </button>
        </div>
      </aside>
    )
  }
  const hasPercentChange = comparison.percentChange !== null
  const primaryValue = hasPercentChange
    ? comparisonValueLabel(comparison)
    : formatCompact(comparison.toValue)
  const primaryNote = hasPercentChange
    ? `${describeComparison(comparison)} from ${comparison.fromYear} to ${comparison.toYear}`
    : describeComparison(comparison)
  const supplementalNote = supplementalCountryNotes[record.iso3]

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
        <span>
          Color compares {comparison.fromYear} arrivals with {comparison.toYear} arrivals where both exist.
        </span>
        <span>No comparison means one or both selected years are missing.</span>
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

      {supplementalNote && (
        <p className="supplemental-note">
          {supplementalNote.text}{' '}
          <a href={supplementalNote.url} target="_blank" rel="noreferrer">
            {supplementalNote.label}
          </a>
        </p>
      )}

      <div className="stat-grid">
        <div>
          <span>From</span>
          <strong>{yearValueLabel(comparison.fromValue, comparison.fromYear)}</strong>
          <small>{sourceLabelForYear(record, comparison.fromYear)}</small>
        </div>
        <div>
          <span>To</span>
          <strong>{yearValueLabel(comparison.toValue, comparison.toYear)}</strong>
          <small>{sourceLabelForYear(record, comparison.toYear)}</small>
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

      <div className="panel-actions">
        <button className="panel-action" type="button" onClick={onClose} aria-label="Close selected country details">
          <X size={16} />
          <span>Close details</span>
        </button>
      </div>
    </aside>
  )
}

function Legend({ fromYear, toYear }: { fromYear: number; toYear: number }) {
  return (
    <div className="legend" aria-label="Color legend">
      <div className="legend-heading">
        <strong>% change</strong>
        <span>{fromYear} to {toYear}</span>
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
          <i className="state-swatch no-comparison" aria-hidden="true" /> Missing selected year
        </span>
        <span>
          <i className="state-swatch same-year" aria-hidden="true" /> Same year
        </span>
        <span>
          <i className="state-swatch no-series" aria-hidden="true" /> No series
        </span>
        <span>
          <i className="state-swatch stale-year" aria-hidden="true" /> Latest before to year
        </span>
      </div>
      <p className="legend-note">
        Values beyond +/-100% are clipped to the color endpoints.
        {fromYear === toYear ? ' Same-year views show coverage, not recovery.' : ''}
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
          {tourismData.source.description} The map compares the selected From year with
          the selected To year where both values exist; {tourismData.coverage['2024'] ?? 0}
          {' '}countries report 2024 in the comparable series.
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
          <li>Dashed borders mean the country&apos;s latest reported year is before the selected To year.</li>
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

function CountryDataList({ fromYear, toYear }: { fromYear: number; toYear: number }) {
  return (
    <section className="sr-only" aria-label="Country data list">
      <h2>Country Data List</h2>
      <ul>
        {tourismData.records.map((record) => {
          const comparison = compareCountry(record, fromYear, toYear)
          return (
            <li key={record.iso3}>
              {record.name}: {yearValueLabel(comparison.fromValue, comparison.fromYear)} to{' '}
              {yearValueLabel(comparison.toValue, comparison.toYear)}; {describeComparison(comparison)}.
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function App() {
  const [fromYear, setFromYear] = useState(2019)
  const [toYear, setToYear] = useState(latestGlobalYear)
  const [selected, setSelected] = useState<SelectedCountry | null>(null)
  const [query, setQuery] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [selectionStatus, setSelectionStatus] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const infoButtonRef = useRef<HTMLButtonElement | null>(null)

  const selectedRecord = selected ? recordsByIso3.get(selected.iso3) ?? null : null
  const selectedComparison = selectedRecord ? compareCountry(selectedRecord, fromYear, toYear) : null

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
    const comparison = record ? compareCountry(record, fromYear, toYear) : null
    setSelected(country)
    setSelectionStatus(
      record && comparison
        ? `Selected ${record.name}. ${comparison.fromYear} to ${comparison.toYear}. ${describeComparison(comparison)}.`
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
  const completeComparisonCount = useMemo(
    () =>
      tourismData.records.filter((record) => {
        const comparison = compareCountry(record, fromYear, toYear)
        return comparison.percentChange !== null
      }).length,
    [fromYear, toYear],
  )

  return (
    <main className="app-shell">
      <div className="app-content" aria-hidden={infoOpen}>
      <header className="topbar">
        <div className="brand-block">
          <h1>Tourism Recovery Map</h1>
          <p>International arrivals, selected year to selected year</p>
        </div>

        <div className="control-row" aria-label="Map controls">
          <div className="year-controls">
            <label className="select-control">
              <span>From</span>
              <select
                aria-label="From year"
                value={fromYear}
                onChange={(event) => setFromYear(Number(event.target.value))}
              >
                {yearOptions.map((year) => (
                  <option value={year} key={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-control">
              <span>To</span>
              <select
                aria-label="To year"
                value={toYear}
                onChange={(event) => setToYear(Number(event.target.value))}
              >
                {yearOptions.map((year) => (
                  <option value={year} key={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
        <CountryMap
          fromYear={fromYear}
          toYear={toYear}
          selected={selected}
          onSelect={selectCountry}
          onClearSelection={() => {
            setSelected(null)
            setSelectionStatus('Country details closed.')
          }}
        />

        <div className="map-overlay">
          <Legend fromYear={fromYear} toYear={toYear} />
          <div className="coverage-strip">
            <span>{tourismData.records.length} data series</span>
            <span>{matchedFeatureCount} mapped country shapes</span>
            <span>{unmappedDataRecords.length} searchable not drawn</span>
            <span>{tourismData.coverage[String(fromYear)] ?? 0} with {fromYear}</span>
            <span>{tourismData.coverage[String(toYear)] ?? 0} with {toYear}</span>
            <span>{completeComparisonCount} with both</span>
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
      <CountryDataList fromYear={fromYear} toYear={toYear} />
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

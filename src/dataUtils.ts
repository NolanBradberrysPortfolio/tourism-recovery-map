import { scaleDiverging } from 'd3-scale'
import { interpolateRgbBasis } from 'd3-interpolate'
import type { BaselineKey, Comparison, CountryRecord } from './types'

const percentScale = scaleDiverging<string>(
  interpolateRgbBasis(['#b5523c', '#f2efe8', '#247c8a']),
)
  .domain([-100, 0, 100])

export const baselineOptions: Array<{ key: BaselineKey; label: string }> = [
  { key: '2019', label: '2019' },
  { key: '2022', label: '2022' },
  { key: '2024', label: '2024 coverage' },
  { key: 'prior', label: 'Prior year' },
]

export function compareCountry(record: CountryRecord, baseline: BaselineKey): Comparison {
  const baselineYear =
    baseline === 'prior' ? record.priorYear : Number.parseInt(baseline, 10)

  if (!Number.isFinite(record.latestValue)) {
    return {
      status: 'missing-latest',
      baselineYear,
      baselineValue: null,
      latestYear: record.latestYear,
      latestValue: record.latestValue,
      absoluteChange: null,
      percentChange: null,
    }
  }

  if (baselineYear === null) {
    return {
      status: 'missing-baseline',
      baselineYear,
      baselineValue: null,
      latestYear: record.latestYear,
      latestValue: record.latestValue,
      absoluteChange: null,
      percentChange: null,
    }
  }

  const baselineValue = record.years[String(baselineYear)]
  if (!Number.isFinite(baselineValue) || baselineValue <= 0) {
    return {
      status: 'missing-baseline',
      baselineYear,
      baselineValue: null,
      latestYear: record.latestYear,
      latestValue: record.latestValue,
      absoluteChange: null,
      percentChange: null,
    }
  }

  const absoluteChange = record.latestValue - baselineValue
  const percentChange = (absoluteChange / baselineValue) * 100

  return {
    status: baselineYear === record.latestYear ? 'same-year' : 'ready',
    baselineYear,
    baselineValue,
    latestYear: record.latestYear,
    latestValue: record.latestValue,
    absoluteChange,
    percentChange,
  }
}

export function colorForComparison(comparison: Comparison): string {
  if (comparison.percentChange === null) {
    return '#d8dde5'
  }
  if (comparison.status === 'same-year') {
    return '#eef2f6'
  }
  return percentScale(Math.max(-100, Math.min(100, comparison.percentChange)))
}

export function formatCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'No data'
  }
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value)
}

export function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'No data'
  }
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'No comparison'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0,
  }).format(value)}%`
}

export function describeComparison(comparison: Comparison): string {
  if (comparison.status === 'missing-baseline') {
    return comparison.baselineYear ? `No ${comparison.baselineYear} comparison` : 'No comparison'
  }
  if (comparison.status === 'missing-latest') {
    return 'No latest data'
  }
  if (comparison.status === 'same-year') {
    return 'Same year'
  }
  if ((comparison.percentChange ?? 0) > 0) {
    return 'Increase'
  }
  if ((comparison.percentChange ?? 0) < 0) {
    return 'Decrease'
  }
  return 'No change'
}

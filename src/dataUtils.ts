import { scaleDiverging } from 'd3-scale'
import { interpolateRgbBasis } from 'd3-interpolate'
import type { Comparison, CountryRecord } from './types'

const percentScale = scaleDiverging<string>(
  interpolateRgbBasis(['#b5523c', '#f2efe8', '#247c8a']),
)
  .domain([-100, 0, 100])

export function compareCountry(record: CountryRecord, fromYear: number, toYear: number): Comparison {
  const fromValue = record.years[String(fromYear)]
  const toValue = record.years[String(toYear)]
  const hasFromValue = Number.isFinite(fromValue) && fromValue > 0
  const hasToValue = Number.isFinite(toValue)

  if (!hasFromValue && !hasToValue) {
    return {
      status: 'missing-both',
      fromYear,
      fromValue: null,
      toYear,
      toValue: null,
      absoluteChange: null,
      percentChange: null,
    }
  }

  if (!hasFromValue) {
    return {
      status: 'missing-from',
      fromYear,
      fromValue: null,
      toYear,
      toValue: hasToValue ? toValue : null,
      absoluteChange: null,
      percentChange: null,
    }
  }

  if (!hasToValue) {
    return {
      status: 'missing-to',
      fromYear,
      fromValue,
      toYear,
      toValue: null,
      absoluteChange: null,
      percentChange: null,
    }
  }

  const absoluteChange = toValue - fromValue
  const percentChange = (absoluteChange / fromValue) * 100

  return {
    status: fromYear === toYear ? 'same-year' : 'ready',
    fromYear,
    fromValue,
    toYear,
    toValue,
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
  if (comparison.status === 'missing-both') {
    if (comparison.fromYear === comparison.toYear) {
      return `No ${comparison.fromYear} data`
    }
    return `No ${comparison.fromYear} or ${comparison.toYear} data`
  }
  if (comparison.status === 'missing-from') {
    return `No ${comparison.fromYear} data`
  }
  if (comparison.status === 'missing-to') {
    return `No ${comparison.toYear} data`
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

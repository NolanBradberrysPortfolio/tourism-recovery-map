export type ComparisonStatus =
  | 'ready'
  | 'same-year'
  | 'missing-from'
  | 'missing-to'
  | 'missing-both'

export type CountryRecord = {
  iso3: string
  name: string
  sourceName: string
  officialName: string
  numericCode: string | null
  region: string
  subregion: string
  latlng: number[] | null
  latestYear: number
  latestValue: number
  priorYear: number | null
  years: Record<string, number>
  sourceBlend?: 'owid-un-tourism' | 'owid-un-tourism-plus-compatible-wdi' | 'world-bank-wdi-only'
  filledYears?: Record<string, string>
  fallbackCompatibility?: {
    overlappingYears: number
    maxRelativeDifference: number
  } | null
}

export type Comparison = {
  status: ComparisonStatus
  fromYear: number
  fromValue: number | null
  toYear: number
  toValue: number | null
  absoluteChange: number | null
  percentChange: number | null
}

export type TourismDataset = {
  generatedAt: string
  baselines: number[]
  valueColumn: string
  coverage: Record<string, number>
  source: {
    name: string
    dataUrl: string
    metadataUrl: string
    fallbackName?: string
    fallbackDataUrl?: string
    fallbackLastUpdated?: string | null
    fallbackMergeRule?: string
    fallbackFilledYears?: number
    fallbackCompatibleCountries?: number
    fallbackOnlyCountries?: number
    chartUrl: string
    originalSourceUrl: string
    lastUpdated: string | null
    nextUpdate: string | null
    timespan: string | null
    unit: string
    description: string
    notes: string[]
    citationLong: string
  }
  records: CountryRecord[]
}

export type GeoIndexEntry = {
  iso3: string
  name: string
  officialName: string
  region: string
  subregion: string
}

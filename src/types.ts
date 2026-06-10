export type BaselineKey = '2019' | '2022' | '2024' | 'prior'

export type ComparisonStatus =
  | 'ready'
  | 'same-year'
  | 'missing-baseline'
  | 'missing-latest'

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
}

export type Comparison = {
  status: ComparisonStatus
  baselineYear: number | null
  baselineValue: number | null
  latestYear: number
  latestValue: number
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

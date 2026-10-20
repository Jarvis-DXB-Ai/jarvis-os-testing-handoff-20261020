export const PITCH_METRIC_KINDS = ['actual', 'founder_assumption', 'target', 'illustrative', 'forecast', 'external_research'] as const
export type PitchMetricKind = typeof PITCH_METRIC_KINDS[number]

export type PitchProjectionScenario = {
  label: string
  clients6: number
  clients12: number
  clients24: number
  clients60: number
  arpu: number
  arpu6?: number
  arpu12?: number
  arpu24?: number
  arpu60?: number
}

export type PitchDeckProfile = {
  id: string
  name: string
  heroHeadline: string
  heroThesis: string
  closingHeadline: string
  founderName: string
  founderBio: string
  founderClaimedOperatingRevenueEur: number
  proposedPreMoneyValuationEur: number
  targetDilutionPercent: number
  targetClients12m: number
  targetAiInfrastructureEur: number
  projectionScenarios: Record<string, PitchProjectionScenario>
  marketAssumptions: {
    euHospitalityEnterprises: number
    initialServiceableBusinesses: number
    nearTermClients: number
    annualEntryRevenue: number
    samNote: string
  }
  useOfFunds: string[]
  risks: Array<{ title: string; mitigation: string }>
  sectionStatus: Record<string, string>
  internalNotes: string
  createdAt: string
  updatedAt: string
}

export type PitchResearchSource = {
  id: string
  title: string
  publisher: string
  publicationDate: string | null
  sourceUrl: string
  claimSupported: string
  methodologyNote: string | null
}

export type PitchRoadmapStage = {
  id: string
  slug: string
  name: string
  status: string
  progress: number
  capabilities: string[]
}

export type PitchDeckSnapshot = {
  profile: PitchDeckProfile
  sources: PitchResearchSource[]
  actuals: {
    mrrEur: number | null
    annualRunRateEur: number | null
    activeRecurringRelationships: number
    financeGeneratedAt: string
  }
  packages: {
    standardMonthlyEur: number | null
    maxMonthlyEur: number | null
    maxDiscountPercent: number
    packageCount: number
    addonCount: number
  }
  roadmap: {
    totalProgress: number
    stages: PitchRoadmapStage[]
  }
  generatedAt: string
}

export const pitchMetricLabel = (kind: PitchMetricKind) => ({
  actual: 'Actual',
  founder_assumption: 'Founder assumption',
  target: 'Target',
  illustrative: 'Illustrative',
  forecast: 'Forecast',
  external_research: 'External research',
})[kind]

export function pitchMoney(amount: number | null, compact = false) {
  if (amount === null || !Number.isFinite(amount)) return 'Not available'
  return new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  }).format(amount)
}

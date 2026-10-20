export const RESEARCH_OPERATIONS = ['search', 'research', 'extract_url', 'crawl_site', 'map_site'] as const
export const RESEARCH_RUN_STATUSES = ['queued', 'running', 'completed', 'failed', 'blocked'] as const

export type ResearchOperation = typeof RESEARCH_OPERATIONS[number]
export type ResearchRunStatus = typeof RESEARCH_RUN_STATUSES[number]

export type ResearchProviderStatus = {
  provider: 'tavily'
  configured: boolean
  executionEnabled: boolean
  capabilities: ResearchOperation[]
  message: string
}

export type ResearchSource = {
  id: string
  source_url: string
  source_title: string | null
  excerpt: string | null
  published_at: string | null
  relevance_score: number | null
  source_type: 'web' | 'document' | 'api'
  metadata: Record<string, unknown>
}

export type ResearchRun = {
  id: string
  client_id: string | null
  feature: string
  provider: 'tavily'
  operation: ResearchOperation
  objective: string
  query: string
  status: ResearchRunStatus
  source_count: number
  credits_used: number | null
  cost_usd_estimated: number | null
  cost_usd_actual: number | null
  latency_ms: number | null
  summary: string | null
  error_message: string | null
  metadata: Record<string, unknown>
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type ResearchSnapshot = {
  provider: ResearchProviderStatus
  clients: Array<{ id: string; name: string }>
  runs: ResearchRun[]
  generatedAt: string
}

export function researchOperationLabel(operation: ResearchOperation) {
  return ({ search: 'Search', research: 'Research', extract_url: 'Extract URL', crawl_site: 'Crawl Site', map_site: 'Map Site' })[operation]
}

export function researchStatusLabel(status: ResearchRunStatus) {
  return ({ queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed', blocked: 'Blocked' })[status]
}

export function isResearchOperation(value: unknown): value is ResearchOperation {
  return typeof value === 'string' && RESEARCH_OPERATIONS.includes(value as ResearchOperation)
}

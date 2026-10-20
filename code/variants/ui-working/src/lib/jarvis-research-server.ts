import 'server-only'

import { clientBrainV2ServerClient as db, isUuid } from '@/lib/client-brain-v2-server-core'
import { isResearchOperation, type ResearchRun, type ResearchSnapshot } from '@/lib/jarvis-research'
import { jarvisResearchProvider, TavilyProviderError } from '@/lib/jarvis-research-provider'

export class JarvisResearchError extends Error { constructor(message: string, public status = 400) { super(message) } }
const runColumns = 'id,client_id,feature,provider,operation,objective,query,status,source_count,credits_used,cost_usd_estimated,cost_usd_actual,latency_ms,summary,error_message,metadata,started_at,completed_at,created_at,updated_at'

function text(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== 'string') { if (required) throw new JarvisResearchError(`${label} is required.`); return '' }
  const result = value.trim()
  if (result.length > max) throw new JarvisResearchError(`${label} is too long.`)
  if (required && result.length < 3) throw new JarvisResearchError(`${label} is required.`)
  return result
}
function resultLimit(value: unknown) {
  if (value === undefined) return 1
  const result = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(result) || result < 1 || result > 5) throw new JarvisResearchError('Result limit must be between 1 and 5.')
  return result
}
function domainFilters(value: unknown) {
  if (value === undefined) return [] as string[]
  if (!Array.isArray(value) || value.length > 5 || !value.every(domain => typeof domain === 'string' && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain))) throw new JarvisResearchError('Domain filters are invalid.')
  return [...new Set(value.map(domain => domain.trim().toLowerCase()))]
}
function metadata(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function normalizeRun(row: Record<string, unknown>) { return { ...row, metadata: metadata(row.metadata) } as ResearchRun }

export async function loadResearchSnapshot(): Promise<ResearchSnapshot> {
  const [runs, clients] = await Promise.all([
    db.from('jarvis_research_runs').select(runColumns).order('created_at', { ascending: false }).limit(60),
    db.from('clients').select('id,name').order('name'),
  ])
  if (runs.error || clients.error) throw new JarvisResearchError('Research workspace could not be loaded.', 500)
  return { provider: jarvisResearchProvider.status(), clients: (clients.data ?? []).map(client => ({ id: client.id, name: client.name })), runs: (runs.data ?? []).map(normalizeRun), generatedAt: new Date().toISOString() }
}

export async function loadResearchRun(runId: string) {
  if (!isUuid(runId)) throw new JarvisResearchError('Research run not found.', 404)
  const [run, sources] = await Promise.all([
    db.from('jarvis_research_runs').select(runColumns).eq('id', runId).maybeSingle(),
    db.from('jarvis_research_sources').select('id,source_url,source_title,excerpt,published_at,relevance_score,source_type,metadata').eq('run_id', runId).order('relevance_score', { ascending: false, nullsFirst: false }),
  ])
  if (run.error || sources.error || !run.data) throw new JarvisResearchError('Research run not found.', 404)
  return { run: normalizeRun(run.data), sources: sources.data ?? [] }
}

export async function executeResearch(input: Record<string, unknown>) {
  const provider = jarvisResearchProvider.status()
  if (!provider.configured || !provider.executionEnabled) throw new JarvisResearchError(provider.message, 409)
  const operation = input.operation
  if (!isResearchOperation(operation)) throw new JarvisResearchError('Research operation is invalid.')
  const objective = text(input.objective, 'Objective', 1600, true)
  const query = text(input.query, 'Question or URL', 2000, true)
  const maxResults = resultLimit(input.maxResults)
  const includeDomains = domainFilters(input.includeDomains)
  const clientId = typeof input.clientId === 'string' && input.clientId ? input.clientId : null
  if (clientId && !isUuid(clientId)) throw new JarvisResearchError('Client scope is invalid.')
  if (clientId) {
    const { data } = await db.from('clients').select('id').eq('id', clientId).maybeSingle()
    if (!data) throw new JarvisResearchError('Client scope was not found.', 404)
  }
  const { data: created, error: createError } = await db.from('jarvis_research_runs').insert({ client_id: clientId, operation, objective, query, provider: 'tavily', status: 'running', started_at: new Date().toISOString(), metadata: { execution_mode: 'live', automatic_retries: 0, max_results: maxResults, include_domains: includeDomains } }).select(runColumns).single()
  if (createError || !created) throw new JarvisResearchError('Research run could not be created.', 500)
  try {
    const result = await jarvisResearchProvider.execute({ operation, objective, query, maxResults, includeDomains })
    if (result.sources.length) await db.from('jarvis_research_sources').insert(result.sources.map(source => ({ run_id: created.id, source_url: source.url, source_title: source.title, excerpt: source.excerpt, published_at: source.publishedAt, relevance_score: source.relevanceScore, metadata: source.metadata })))
    const { error: updateError } = await db.from('jarvis_research_runs').update({ status: 'completed', source_count: result.sources.length, credits_used: result.creditsUsed, latency_ms: result.latencyMs, summary: result.summary, metadata: { execution_mode: 'live', automatic_retries: 0, ...result.rawMetadata }, completed_at: new Date().toISOString() }).eq('id', created.id)
    if (updateError) throw new JarvisResearchError('Research result could not be persisted.', 500)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research request failed.'
    await db.from('jarvis_research_runs').update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() }).eq('id', created.id)
    if (error instanceof JarvisResearchError) throw error
    if (error instanceof TavilyProviderError) throw new JarvisResearchError(message, error.status)
    throw new JarvisResearchError(message, 502)
  }
  return loadResearchSnapshot()
}

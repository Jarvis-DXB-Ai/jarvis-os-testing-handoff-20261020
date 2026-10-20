import 'server-only'

import { type ResearchOperation, type ResearchProviderStatus } from '@/lib/jarvis-research'

export type ProviderResearchResult = {
  provider: 'tavily'
  operation: ResearchOperation
  query: string
  status: 'completed'
  summary: string | null
  sources: Array<{ url: string; title: string | null; excerpt: string | null; publishedAt: string | null; relevanceScore: number | null; metadata: Record<string, unknown> }>
  creditsUsed: number | null
  latencyMs: number | null
  rawMetadata: Record<string, unknown>
}

export type ProviderResearchRequest = {
  operation: ResearchOperation
  query: string
  objective: string
  maxResults?: number
  includeDomains?: string[]
}

export interface JarvisResearchProvider {
  status(): ResearchProviderStatus
  execute(input: ProviderResearchRequest): Promise<ProviderResearchResult>
}

const operations: ResearchOperation[] = ['search', 'research', 'extract_url', 'crawl_site', 'map_site']
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const TAVILY_TIMEOUT_MS = 15_000

export class TavilyProviderError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

function providerErrorMessage(payload: Record<string, unknown>, status: number) {
  const detail = payload.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && typeof (detail as Record<string, unknown>).error === 'string') return (detail as Record<string, string>).error
  return `Tavily request failed (${status}).`
}

function requestOptions(input: ProviderResearchRequest) {
  const maxResults = Number.isInteger(input.maxResults) && input.maxResults && input.maxResults >= 1 && input.maxResults <= 5
    ? input.maxResults
    : 1
  const includeDomains = [...new Set((input.includeDomains ?? [])
    .map(value => value.trim().toLowerCase())
    .filter(value => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value)))].slice(0, 5)
  return { maxResults, includeDomains }
}

class TavilyResearchProvider implements JarvisResearchProvider {
  status(): ResearchProviderStatus {
    const configured = Boolean(process.env.TAVILY_API_KEY?.trim())
    const executionEnabled = configured
    return {
      provider: 'tavily', configured, executionEnabled, capabilities: operations,
      message: !configured
        ? 'Tavily is not configured. Add a server-side TAVILY_API_KEY to enable intentional research runs.'
        : 'Tavily is configured for one intentional operation per requested run. No automatic retries are used.',
    }
  }

  async execute(input: ProviderResearchRequest): Promise<ProviderResearchResult> {
    const status = this.status()
    if (!status.configured || !status.executionEnabled) throw new Error('Research execution is not enabled.')
    // V1 intentionally runs only the low-cost, synchronous Search endpoint.
    // The remaining capability vocabulary is retained for future provider
    // adapters, but Research requires task polling and URL operations need a
    // separate URL-oriented form before they can be safely exposed.
    if (input.operation !== 'search') throw new Error('Only Tavily Search is execution-ready in Research V1. The other provider capabilities are modeled but intentionally not live yet.')
    const apiKey = process.env.TAVILY_API_KEY?.trim()
    if (!apiKey) throw new TavilyProviderError('Tavily API key is missing.', 503)
    const { maxResults, includeDomains } = requestOptions(input)
    const body = { query: input.query, search_depth: 'basic', max_results: maxResults, include_domains: includeDomains, include_answer: false, include_raw_content: false, include_usage: true }
    const started = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(TAVILY_SEARCH_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), cache: 'no-store', signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new TavilyProviderError('Tavily request timed out.', 504)
      throw new TavilyProviderError('Tavily connection failed.', 502)
    } finally {
      clearTimeout(timeout)
    }
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new TavilyProviderError(providerErrorMessage(payload, response.status), response.status)
    const results = Array.isArray(payload.results) ? payload.results : []
    return {
      provider: 'tavily', operation: input.operation, query: input.query, status: 'completed',
      summary: typeof payload.answer === 'string' ? payload.answer : null,
      sources: results.filter(value => value && typeof value === 'object').map(value => {
        const row = value as Record<string, unknown>
        return { url: typeof row.url === 'string' ? row.url : '', title: typeof row.title === 'string' ? row.title : null, excerpt: typeof row.content === 'string' ? row.content : null, publishedAt: typeof row.published_date === 'string' ? row.published_date : null, relevanceScore: typeof row.score === 'number' ? row.score : null, metadata: {} }
      }).filter(source => source.url),
      creditsUsed: typeof (payload.usage as Record<string, unknown> | undefined)?.credits === 'number' ? (payload.usage as Record<string, number>).credits : null,
      latencyMs: Date.now() - started,
      rawMetadata: { request_id: typeof payload.request_id === 'string' ? payload.request_id : null, response_time: payload.response_time ?? null, max_results: maxResults, include_domains: includeDomains },
    }
  }
}

export const jarvisResearchProvider: JarvisResearchProvider = new TavilyResearchProvider()

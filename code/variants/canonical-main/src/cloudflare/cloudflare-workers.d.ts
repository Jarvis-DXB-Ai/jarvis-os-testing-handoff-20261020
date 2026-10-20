declare module "cloudflare:workers" {
  export type WorkflowEvent<Params = unknown> = { payload: Params }
  export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>
    waitForEvent<T>(name: string, options: { type: string; timeout: string }): Promise<{ payload: T }>
  }
  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected env: Env
    abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>
  }
  export interface WorkflowInstance {
    id: string
    sendEvent(event: { type: string; payload?: unknown }): Promise<void>
  }
  export interface Workflow<Params = unknown> {
    create(options?: { id?: string; params?: Params }): Promise<WorkflowInstance>
    get(id: string): Promise<WorkflowInstance>
  }
  export const env: {
    NEXT_PUBLIC_SUPABASE_URL: string
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string
    SUPABASE_SERVICE_ROLE_KEY: string
    ANTHROPIC_API_KEY: string
    GEMINI_API_KEY: string
    TOPAZ_API_KEY: string
    ZERNIO_API_KEY: string
    ZERNIO_WEBHOOK_SECRET: string
    PINTEREST_ACCESS_TOKEN: string
    TAVILY_API_KEY: string
    CLIENT_VAULT_ENCRYPTION_KEY: string
    AI_CONTENT_STUDIO_MODE: string
    SOCIAL_INDIVIDUAL_PRODUCTION_MODE: string
    SOCIAL_PUBLISHING_MODE: string
    JARVIS_RUNTIME_WORKER_ORIGIN: string
    AGENT_RUNTIME_INTERNAL_TOKEN: string
  }
}

import "server-only";

type LoaderMetric = {
  loader: string;
  durationMs: number;
  readOperations: number;
  outcome: "ok" | "error";
  instanceMarker: string;
  instanceUptimeMs: number;
};

const instanceStartedAt = Date.now();
const instanceMarker = Math.random().toString(36).slice(2, 10);

/**
 * Low-noise, server-only loader instrumentation. It is intentionally opt-in in
 * production so operational pages do not gain an always-on logging cost.
 */
export async function measureServerLoader<T>(
  loader: string,
  readOperations: number,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  let outcome: LoaderMetric["outcome"] = "ok";
  try {
    return await operation();
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.JARVIS_PERF_LOG === "1"
    ) {
      const metric: LoaderMetric = {
        loader,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        readOperations,
        outcome,
        instanceMarker,
        instanceUptimeMs: Date.now() - instanceStartedAt,
      };
      console.info("[jarvis-perf]", JSON.stringify(metric));
    }
  }
}

export function serverTiming(name: string, durationMs: number) {
  return `${name};dur=${Math.max(0, Math.round(durationMs * 10) / 10)}`;
}

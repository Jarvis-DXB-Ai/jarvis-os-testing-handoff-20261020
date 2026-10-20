export const OFFICE_READ_TIMEOUT_MS = 8000;
export const OFFICE_RECORD_MAX_AGE_MS = 12000;
export const OFFICE_READINESS_MAX_AGE_MS = 90000;

// GETs only. A mutation's unknown acknowledgement must never trigger a retry.
export async function readOfficeJson(path, {fetchImpl = fetch, timeoutMs = OFFICE_READ_TIMEOUT_MS} = {}) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(path, {method: 'GET', cache: 'no-store', signal: controller.signal});
        const value = await response.json();
        if (!response.ok) throw new Error(value?.error ?? 'Office connection unavailable.');
        return value;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Office read timed out. Saved work is retained.'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readOfficeRecords({onBoard, onCatalog, onBoardError, onCatalogError, ...options}) {
  await Promise.allSettled([
    readOfficeJson('/api/office/paperclip', options).then(board => {
      if (!board || !Array.isArray(board.agents) || !Array.isArray(board.issues) || !Array.isArray(board.runs)) throw new Error('Invalid Office roster.');
      onBoard(board);
    }).catch(onBoardError),
    readOfficeJson('/api/office/teams', options).then(catalog => {
      if (!catalog || !Array.isArray(catalog.jobs) || typeof catalog.enabled !== 'boolean') throw new Error('Invalid Office task records.');
      onCatalog(catalog);
    }).catch(onCatalogError),
  ]);
}

function fresh(now, timestamp, maxAge) {
  return Number.isFinite(now) && Number.isFinite(timestamp) && timestamp > 0 && now >= timestamp && now - timestamp < maxAge;
}

export function officeReadState({now, readiness, boardConnected, observedAt, catalogReachable, recordsObservedAt}) {
  const boardFresh = boardConnected === true && fresh(now, observedAt, OFFICE_RECORD_MAX_AGE_MS);
  const recordsFresh = catalogReachable === true && fresh(now, recordsObservedAt, OFFICE_RECORD_MAX_AGE_MS);
  const readinessFresh = fresh(now, Date.parse(readiness?.checkedAt ?? ''), OFFICE_READINESS_MAX_AGE_MS);
  return {boardFresh, recordsFresh, readinessFresh, connected: boardFresh && recordsFresh,
    canEnqueue: boardFresh && recordsFresh && readinessFresh && readiness?.canEnqueue === true};
}

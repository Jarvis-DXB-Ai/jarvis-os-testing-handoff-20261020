const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/
const key = (clientId: string, workspace: 'publishing' | 'planner') => `jarvis:social-month:${clientId}:${workspace}`
const sharedKey = (clientId: string) => `jarvis:social-month:${clientId}:last`

export function currentSocialMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` }
export function readSocialMonthPreference(clientId: string, workspace: 'publishing' | 'planner') {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(key(clientId, workspace)) ?? window.localStorage.getItem(sharedKey(clientId))
  return MONTH.test(value ?? '') ? value : null
}
export function writeSocialMonthPreference(clientId: string, workspace: 'publishing' | 'planner', month: string) {
  if (typeof window === 'undefined' || !MONTH.test(month)) return
  window.localStorage.setItem(key(clientId, workspace), month)
  window.localStorage.setItem(sharedKey(clientId), month)
}
export function sensibleSocialMonth(months: string[], fallback = currentSocialMonth()) {
  const normalized = months.map(value => value.slice(0, 7)).filter(value => MONTH.test(value)).sort()
  if (normalized.includes(fallback)) return fallback
  return normalized.find(value => value >= fallback) ?? normalized.at(-1) ?? fallback
}

"use client";
import { MAX_TEST_RUNS, parseSavedOfficeRuns, type OfficeTestRun } from "@/lib/office";
const KEY = "jarvis.office.tests.v1";
type State = { runs: OfficeTestRun[]; warning: string | null };
const empty: State = { runs: [], warning: null };
let state: State | null = null;
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const serverSnapshot = () => empty;
export function snapshot(): State {
  if (state) return state;
  try { state = { runs: parseSavedOfficeRuns(sessionStorage.getItem(KEY)), warning: null }; }
  catch { state = { runs: [], warning: "Saved tests could not be read. New tests will remain visible in this tab." }; }
  return state;
}
export function saveRun(run: OfficeTestRun) {
  const current = snapshot();
  const runs = [run, ...current.runs.filter(r => r.id !== run.id)].slice(0, MAX_TEST_RUNS);
  state = { runs, warning: null };
  try { sessionStorage.setItem(KEY, JSON.stringify(runs)); }
  catch { state.warning = "Browser storage is unavailable. Keep this page open or export your test results."; }
  listeners.forEach(listener => listener());
}

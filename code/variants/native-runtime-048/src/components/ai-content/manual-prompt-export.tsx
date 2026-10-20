"use client";

import { useRef, useState } from "react";

type Export = {
  prompt: string;
  note: string;
  metadata_gaps: string[];
  references: { image_number: number; reference_id: string; name: string; role: string; thumbnail_url: string }[];
};

export function ManualPromptExport({ clientId, sessionId, brief, correction, aspectRatio, referenceRevision, disabled, promptId }: {
  clientId: string; sessionId: string; brief: string; correction: string; aspectRatio: string; referenceRevision: string; disabled: boolean; promptId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ basis: string; data: Export } | null>(null);
  const basis = JSON.stringify([clientId, sessionId, brief, correction, aspectRatio, referenceRevision, promptId]);
  const current = result?.basis === basis ? result.data : null;
  async function prepare() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setResult(null); setCopied(false);
    dialog.current?.showModal();
    try {
      const response = await fetch(`/api/clients/${clientId}/ai-content/${sessionId}/manual-prompt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creative_request: brief, correction, aspect_ratio: aspectRatio, prompt_id: promptId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to prepare the manual prompt.");
      setResult({ basis, data });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to prepare the manual prompt."); }
    finally { setBusy(false); inFlight.current = false; }
  }
  async function copy() {
    if (!current) return;
    try { await navigator.clipboard.writeText(current.prompt); setCopied(true); }
    catch { setError("Clipboard unavailable. Select the prompt text or download it instead."); }
  }
  function download() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([current.prompt], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "studio-manual-prompt.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <button type="button" onClick={() => void prepare()} disabled={disabled || busy || !brief.trim()}
      className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/85 disabled:opacity-40">
      {promptId ? "Export AI prompt" : "Export template instead"}
    </button>
    <dialog ref={dialog} aria-labelledby="manual-prompt-title" className="m-auto max-h-[85dvh] w-[min(48rem,calc(100%-2rem))] overflow-auto rounded-2xl border border-white/15 bg-[#141416] p-5 text-white backdrop:bg-black/70">
      <div className="flex items-center justify-between gap-4"><h2 id="manual-prompt-title" className="text-lg font-semibold">Prompt for manual generation</h2>
        <button type="button" onClick={() => dialog.current?.close()} className="rounded-lg border border-white/20 px-3 py-1">Close</button></div>
      {busy && <p role="status" className="mt-4">Preparing your reference list and prompt…</p>}
      {error && <p role="alert" className="mt-4 text-amber-200">{error}</p>}
      {current && <>
        <p className="my-4 text-sm text-white/65">{current.note}</p>
        {current.metadata_gaps.length > 0 && <div className="mb-4 rounded-lg border border-amber-200/25 p-3 text-sm text-amber-100">
          <p>More context would improve this prompt:</p>
          <ul className="mt-2 list-disc pl-5">{current.metadata_gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
        </div>}
        <ol className="mb-4 space-y-2 text-sm">{current.references.map(reference => <li key={reference.reference_id}>
          Image {reference.image_number}: <a href={reference.thumbnail_url} target="_blank" rel="noopener noreferrer" className="text-emerald-200 underline">{reference.name}</a>
          <span className="text-white/50"> · {reference.role.replaceAll("_", " ")}</span>
        </li>)}</ol>
        <label className="block text-sm" htmlFor="manual-prompt-text">Prompt to review and use with your attached images</label>
        <textarea id="manual-prompt-text" readOnly value={current.prompt} className="mt-2 h-64 w-full rounded-xl border border-white/15 bg-black/25 p-3 text-sm leading-6" />
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void copy()} className="rounded-lg bg-emerald-300 px-4 py-2 font-semibold text-[#06210f]">{copied ? "Copied" : "Copy prompt"}</button>
          <button type="button" onClick={download} className="rounded-lg border border-white/20 px-4 py-2">Download .txt</button></div>
        <p className="mt-3 text-xs text-white/50">Image links expire. Prepare the export again to refresh them. This export does not save a generation or approve content.</p>
      </>}
      {!busy && !error && result && !current && <p className="mt-4">The brief or references changed. Close this window and prepare a fresh prompt.</p>}
    </dialog>
  </>;
}

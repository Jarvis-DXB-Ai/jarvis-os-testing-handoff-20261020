"use client";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./agents-branding.module.css";

export function keepDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
  const first = elements[0]; const last = elements.at(-1);
  if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/** Native modal supplies focus containment and makes background actions inert. */
export function AgentModal({label, onClose, busy = false, wide = false, children}: {label: string; onClose: () => void; busy?: boolean; wide?: boolean; children: ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} onKeyDown={keepDialogFocus} aria-label={label} aria-busy={busy} className={`${styles.dialog} ${styles.existingDialog}`} data-wide={wide} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}

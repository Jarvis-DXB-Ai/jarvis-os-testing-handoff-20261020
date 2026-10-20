type JarvisMeterProps = {
  value: number
  label: string
  ticks?: number
  className?: string
}

/** A quiet, reusable progress primitive for real Jarvis operating signals. */
export function JarvisMeter({ value, label, ticks = 32, className = "" }: JarvisMeterProps) {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const filledTicks = Math.round(normalized * ticks)

  return (
    <div className={`flex h-4 items-end gap-[3px] ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(normalized * 100)}>
      {Array.from({ length: ticks }, (_, index) => (
        <span key={index} aria-hidden="true" className={`h-full flex-1 rounded-[1px] transition-colors duration-200 motion-reduce:transition-none ${index < filledTicks ? "bg-emerald-300" : "bg-white/[.10]"}`} />
      ))}
    </div>
  )
}

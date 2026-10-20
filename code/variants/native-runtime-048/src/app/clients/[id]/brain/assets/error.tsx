'use client';
export default function Error({ reset }: { reset: () => void }) {
  return <section role="alert" className="py-8 text-white"><h2>Assets unavailable</h2><p className="my-4 text-white/60">The library could not load. Your assets have not been removed.</p><button type="button" onClick={reset}>Try again</button></section>;
}

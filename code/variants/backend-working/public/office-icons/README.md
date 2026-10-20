# Third-party identity artwork

Use current official vendor app icons or brand assets first. A reputable vector registry is acceptable only after checking its geometry against the current vendor identity. Never draw an approximation, generate a logo, invent initials, or extract a letter from a wordmark as a substitute for the supplied app mark.

Preserve the supplied proportions, padding, shape and colors. Do not recolor vendor artwork to match Jarvis, apply grayscale/saturation filters, or fade it to indicate connection status. Use the separate status dot and written connection details. Resize with `object-fit: contain`; do not crop. Keep any permitted monochrome variant explicitly documented.

Every displayed provider mark must be registered in `sources.json` with its provider ID, local filename, source URL, verification date, ownership/licence note and SHA-256. The Office dock uses this registry directly. Missing verified artwork renders a text label until the actual asset is obtained.

Before completing an icon change, run `node scripts/verify-office-icons.mjs`, inspect the actual main and optional docks at desktop and phone widths, and verify that connection states have not changed the artwork. Hash verification protects the reviewed file; it does not replace visual/source review when a vendor changes its identity.

Pinterest uses its unmodified official red badge favicon, checked against [Pinterest's guidelines](https://business.pinterest.com/brand-guidelines/). Manychat uses its unmodified supplied site app icon. Archived earlier SVG candidates may remain in this folder but are not used by the registry.

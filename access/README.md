# Temporary current-app public read adapter

This directory contains the exact reviewed shared policy/HMAC helper and bridge added for the owner-authorized temporary test. It is additional access code, separate from the five original source snapshots. No live key or filled production deployment configuration is supplied. The example is disabled.

The bridge targets the existing production Durable Object via a cross-script binding. The container loads `/app/public-read-051.cjs`. Ten compiled owner-auth adapters call this helper for verified public reads and retain their original owner check if no public proof exists. Do not patch arbitrary compiled files: the accepted baseline and exact architecture are described in the master document. New source development should implement the equivalent adapter in the source and rebuild normally.

Pass the three dedicated environment values from the existing Worker into its container: `JARVIS_PUBLIC_READ_ONLY_MODE`, `JARVIS_PUBLIC_READ_ONLY_UNTIL`, and `JARVIS_PUBLIC_READ_CONTEXT_KEY`. Generate a new independent 32-byte secret for your own deployment and store it through your secret manager; never reuse owner sessions, machine tokens or database credentials. Do not put it into this example, the browser or source control.

The checked-in policy has a finite 21 October 2026 12:30 UTC hard stop. This is a dated handoff, not reusable indefinite public access. A future deployment needs its own reviewed scope/deadline. Unknown paths, mutations, credentials, private grants, native operations, Inbox and WhatsApp remain closed. Existing ordinary client/Finance/Brain data viewing was explicitly approved by the owner.

The current access URL and verified result will be recorded in the root access receipt after activation. Original owner login remains on its usual URL. The Office on the hosted image is the visual simulation; newer native runtime source is supplied for local development, not claimed live.

The current bridge entrypoint is `access-static-fix/public-bridge.STATIC-FIX.mjs`, with its exact finite static-file list/transport helper. The unchanged policy and original bridge are retained in `access-implementation/`. The static exception permits only 120 verified existing Next/Office asset URLs, including bracketed Next chunks and uppercase Office imports; it does not grant more API or business-data access. Preserve this relative folder structure when bundling.

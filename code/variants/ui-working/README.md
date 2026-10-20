# MC Dashboard

Next.js dashboard for MC Studios client operations, Supabase-backed client brain data, asset uploads, execution review workflows, and AI-assisted extraction.

## Development

Install dependencies if needed:

```bash
npm install
```

Run the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful scripts:

```bash
npm run build
npm run start
npm run lint
```

## Environment Variables

Create `.env.local` from `.env.example` and fill in local values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

Do not commit `.env.local` or any file containing real secrets.

## Supabase Notes

The app uses Supabase for database access and private asset storage.

Required storage bucket:

- `client-assets` - private bucket used for original uploads, optimized image variants, AI preview images, and signed preview/download URLs.

Common tables used by the dashboard include:

- `asset_uploads` - uploaded asset records, file paths, optimization details, extraction status, and asset metadata.
- `brain_update_proposals` - AI-proposed client brain updates generated from uploaded assets.
- `client_brain` - structured client knowledge entries.
- `client_knowledge` - additional client knowledge records.
- `clients` - client records.
- `ai_usage_logs` - AI usage tracking.

Server API routes use `SUPABASE_SERVICE_ROLE_KEY` for private storage and database operations. Browser-side Supabase access uses the public URL and anon key.

## Docker

Docker is not required for local development. Run the app directly with Node.js and `npm run dev`.

## PDF Image Processing

Text-layer PDFs are parsed in Node. Image-based PDF processing depends on Poppler's `pdftoppm`; the current server route expects it at:

```bash
/opt/homebrew/bin/pdftoppm
```

On macOS, install Poppler with:

```bash
brew install poppler
```

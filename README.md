# Asset Encoder

Image curation pipeline for the JJCDDS (Ja Ja Co Decimal System) classification. Upload images, classify them with Gemini AI, review and approve into the Sanity dataset.

## Pipeline

1. **Upload** — drag-and-drop images into Sanity as `curatedAsset` documents (status: `pending`)
2. **Analyze** — Gemini 2.0 Flash classifies each image against the JJCDDS taxonomy
3. **Review** — human reviews AI suggestions in a grid + editor UI, can accept/edit/retry/delete
4. **Approve** — publishes individual items or batch-approves high-confidence (≥80%) items

## Setup

```bash
npm install
cp .env.example .env  # fill in your values
npm run dev
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `AUTH_PASSWORD` | Password for the login page |
| `SANITY_READ_TOKEN` | Read `curatedAsset` documents |
| `SANITY_WRITE_TOKEN` | Create/patch/delete documents and upload images |
| `SANITY_API_VERSION` | Sanity API version (default: `2025-10-01`) |
| `GEMINI_API_KEY` | Google Gemini 2.0 Flash for image classification |

## Project Structure

```
src/
  lib/
    jjcdds.ts                    # Shared JJCDDS taxonomy constant
    sanity/client.ts             # Public Sanity config (projectId, dataset)
    server/
      env.ts                     # Env var helper (platform.env + .env fallback)
      sanity.ts                  # Authenticated Sanity read/write clients
      curate-analyzer.ts         # Gemini integration (analyzeImage, analyzeAndPatchDocument)
  routes/
    +layout.svelte               # Root layout with Upload/Review tabs
    +page.svelte                 # Upload page (drag-and-drop, concurrent queue)
    review/
      +page.server.ts            # Fetches pending/draft/error assets from Sanity
      +page.svelte               # Review dashboard (grid, editor, batch approve)
    login/
      +page.svelte               # Password login form
      +page.server.ts            # Cookie-based auth
    api/
      drop/+server.ts            # POST: upload image, create pending doc, schedule analysis
      analyze/+server.ts         # POST: standalone analysis endpoint
      approve/+server.ts         # POST: approve single document
      batch-approve/+server.ts   # POST: bulk approve above confidence threshold
      delete/+server.ts          # DELETE: remove document + image asset
      retry/+server.ts           # POST: reset errored doc, re-run analysis
```

## Deployment

Works with any SvelteKit adapter. For Cloudflare Workers:

- `drop` and `retry` endpoints use `platform.ctx.waitUntil()` for background analysis
- Env vars go in Cloudflare dashboard or `wrangler.toml`
- Switch to `@sveltejs/adapter-cloudflare`

For other platforms, analysis runs inline (response waits for Gemini).

## Sanity

- Project ID: `0mg3gtri`
- Dataset: `production`
- Document type: `curatedAsset` (schema in jajaco--backend)
- Published assets become available to the main portfolio

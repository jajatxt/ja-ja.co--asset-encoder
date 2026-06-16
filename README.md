# Ja Ja Co Admin

Admin app for the Ja Ja Co portfolio. It combines the JJCDS asset encoder with request-access review and temporary access-link management.

## Main workflows

1. **Asset encoding** — upload images, classify them with Gemini against the JJCDS taxonomy, review/edit suggestions, and approve into Sanity.
2. **Access requests** — review public submissions from `ja-ja.co/request-access`.
3. **Access links** — create scoped temporary links for the main portfolio and optionally email them via Resend.

## Setup

```bash
npm install
cp .env.example .env  # fill in your values
npm run dev
```

## Environment variables

| Variable | Purpose |
|---|---|
| `AUTH_PASSWORD` | Password for the admin login page |
| `SANITY_READ_TOKEN` | Read Sanity documents from the private production dataset |
| `SANITY_WRITE_TOKEN` | Create/patch/delete Sanity documents and upload images |
| `SANITY_API_VERSION` | Sanity API version (default: `2025-10-01`) |
| `GEMINI_API_KEY` | Google Gemini for image classification |
| `FRONTEND_ORIGIN` | Main portfolio origin for generated access links, usually `https://ja-ja.co` |
| `FRONTEND_ACCESS_LINK_BASE_PATH` | Access-link redemption base path, usually `/access` |
| `FRONTEND_ADMIN_TOKEN` | Shared Bearer token for portfolio admin APIs, including access requests |
| `EMAIL_PROVIDER` | `manual`/`off` for no sending, or `resend` for email delivery |
| `RESEND_API_KEY` | Resend API key when `EMAIL_PROVIDER=resend` |
| `ACCESS_EMAIL_FROM` | Sender, e.g. `Ja Ja Co <hello@ja-ja.co>` |
| `ACCESS_EMAIL_REPLY_TO` | Monitored reply-to address |

Cloudflare bindings:

- `DB` — shared production D1 database used for request/access-link records and admin login rate limits.
- `ACTIVE_PATHS` — frontend KV binding, used only when creating current-cycle-bound links.

## Access-link policy

Access links are stored separately from coupon codes, but the main site redeems them through `/access/[token]` and then uses the shared `coupon-access` browser cookie/session validator.

Access links can grant:

- All pages
- Projects
- Writing
- Media (`/video`, `/audio`)
- Reading Room (`/s/reading-room` and `/s/reading-room/[code]`)
- System (all `/s/*`)
- Selected pages
- Custom combinations of groups and selected pages

For selected project/writing links, the admin UI includes a checked option to include related image/code pages. When enabled, the app queries Sanity at link creation time and stores the concrete `/s/reading-room/[code]` paths in the access link.

Revoking an access link also revokes active sessions for that link. Link expiry is the redemption deadline; session duration controls how long access lasts after redemption.

## Project structure

```text
src/
  lib/
    jjcdds.ts                    # Shared JJCDS taxonomy constant
    sanity/client.ts             # Public Sanity config (projectId, dataset)
    server/
      access-email.ts            # Access-link email copy + Resend delivery
      access-links.ts            # Access-link creation, scope config, page options
      env.ts                     # Env var helper (platform.env + .env fallback)
      login-rate-limit.ts        # App-level admin login rate limiting
      sanity.ts                  # Authenticated Sanity read/write clients
      curate-analyzer.ts         # Gemini integration
  routes/
    +layout.svelte               # Root admin layout + logout
    +page.svelte                 # Upload page
    review/                      # Asset review dashboard
    login/                       # Password login form/action
    logout/+server.ts            # Logout endpoint
    access-links/                # Create/revoke portfolio access links
    access-requests/             # Review public request-access submissions
    api/                         # Asset upload/analyze/approve/retry/delete endpoints
```

## Deployment

Production runs on Cloudflare Workers at `admin.ja-ja.co`.

- Env vars/secrets are configured in Cloudflare, not committed.
- Resend is send-only; inbound/replies should be handled by IONOS or another mailbox/forwarding setup.
- App-level login rate limiting is enforced in D1; Cloudflare Access is not currently used.

## Sanity

- Project ID: `0mg3gtri`
- Dataset: `production` private dataset
- Asset staging document type: `curatedAsset` (schema in `jajaco--backend`)
- Approved encoded assets become available to the main portfolio

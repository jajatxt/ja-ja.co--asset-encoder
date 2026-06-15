# Access links shared D1 contract

The admin app creates access links directly in the shared D1 database. The frontend redeems and enforces those links.

## Ownership

- Shared D1 stores access requests, access links, and access sessions.
- Asset encoder/admin writes access-link rows directly.
- Frontend reads/redeems those rows, sets access cookies, and gates routes.

There should not be an admin-to-frontend API hop for creating access links.

## Required bindings

Admin deployment needs the same D1 database binding as the frontend:

```text
DB
```

Current-cycle links also need the same KV binding if that option is enabled:

```text
ACTIVE_PATHS
```

## Admin-created table

See `migrations/0011_access_links.sql`.

Core row fields:

- `token_hash`: SHA-256 hash of the URL token used for redemption lookup.
- `token_display`: raw URL token stored for admin view/copy workflows.
- `mode`: `full`, `limited`, or `single-path`.
- `start_path`: where redemption redirects.
- `max_redemptions` / `redeemed_count`: link use limit.
- `max_unique_paths`: `NULL` for full access, positive integer for bounded access.
- `session_ttl_minutes`: duration of the redeemed access session.
- `expires_at`: link expiry.
- `issued_cycle`: optional cycle binding.

## Mode behavior

- `full`: all pages; `max_unique_paths` is `NULL`.
- `limited`: set number of unique pages; `max_unique_paths` is a positive integer.
- `single-path`: only the start page; `max_unique_paths` is `1`.

## Admin UX

- `/access-links` creates general-purpose access links.
- `/access-requests` keeps the review workflow, but can create a linked access grant from a request row.
- Request-linked grants use the request `source_path` as the default start page when present.
- Both screens use a page picker backed by known static routes plus Sanity projects/writing entries, so admins do not need to know URL structure.
- `access_request_links` collates generated access links with request rows.

## Access request email

When creating a request-linked grant from `/access-requests`, the admin can optionally email the link to the requester.

- If `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `ACCESS_EMAIL_FROM` are configured, the action sends a simple transactional email through Resend.
- If email is not configured or sending fails, the link is still created, the request is still approved, and the UI shows copy/manual email fallback actions.
- `ACCESS_EMAIL_REPLY_TO` is optional.

## Frontend follow-up

The frontend needs a redemption route, likely:

```text
/access/[token]
```

That route should:

1. Hash the URL token.
2. Find an active `access_links` row.
3. Reserve one redemption.
4. Create an `access_link_sessions` row.
5. Set the frontend access cookie.
6. Redirect to `start_path`.

Route gating should treat `remaining_unique_paths = NULL` as unlimited/full access.

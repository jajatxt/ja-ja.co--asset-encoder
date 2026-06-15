-- Adds scoped access grants for access links.
-- Scope limits where a full/limited access-link session may spend or use access.

ALTER TABLE access_links ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'all';
ALTER TABLE access_links ADD COLUMN scope_paths TEXT;
ALTER TABLE access_links ADD COLUMN scope_prefixes TEXT;

CREATE INDEX IF NOT EXISTS idx_access_links_scope_kind ON access_links(scope_kind);

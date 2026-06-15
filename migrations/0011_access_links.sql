-- Product-level access grants created by the admin app and redeemed by the frontend.
-- Redemption should hash the URL token and look it up by token_hash.

CREATE TABLE IF NOT EXISTS access_links (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  label                 TEXT,
  token_hash            TEXT NOT NULL UNIQUE,
  mode                  TEXT NOT NULL DEFAULT 'limited' CHECK (mode IN ('full', 'limited')),
  start_path            TEXT NOT NULL DEFAULT '/',
  max_redemptions       INTEGER NOT NULL DEFAULT 1,
  redeemed_count        INTEGER NOT NULL DEFAULT 0,
  max_unique_paths      INTEGER,
  session_ttl_minutes   INTEGER NOT NULL DEFAULT 10080,
  expires_at            INTEGER,
  bind_to_current_cycle INTEGER NOT NULL DEFAULT 0,
  issued_cycle          TEXT,
  created_at            INTEGER NOT NULL,
  disabled_at           INTEGER,
  last_redeemed_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_access_links_active ON access_links(disabled_at, expires_at, issued_cycle);
CREATE INDEX IF NOT EXISTS idx_access_links_created ON access_links(created_at DESC);

CREATE TABLE IF NOT EXISTS access_link_sessions (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  access_link_id         INTEGER NOT NULL REFERENCES access_links(id) ON DELETE CASCADE,
  session_token_hash     TEXT NOT NULL UNIQUE,
  created_at             INTEGER NOT NULL,
  expires_at             INTEGER NOT NULL,
  remaining_unique_paths INTEGER,
  used_unique_paths      INTEGER NOT NULL DEFAULT 0,
  issued_cycle           TEXT,
  last_seen_at           INTEGER,
  revoked_at             INTEGER
);

CREATE INDEX IF NOT EXISTS idx_access_link_sessions_expiry ON access_link_sessions(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS access_link_session_paths (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES access_link_sessions(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  UNIQUE(session_id, path)
);

CREATE INDEX IF NOT EXISTS idx_access_link_session_paths_session ON access_link_session_paths(session_id);

CREATE TABLE IF NOT EXISTS access_request_links (
  access_request_id INTEGER NOT NULL,
  access_link_id    INTEGER NOT NULL REFERENCES access_links(id) ON DELETE CASCADE,
  created_at        INTEGER NOT NULL,
  PRIMARY KEY (access_request_id, access_link_id)
);

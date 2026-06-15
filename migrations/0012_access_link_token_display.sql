-- Store the URL token for admin copy/view workflows.
-- Redemption should still use token_hash for lookup.

ALTER TABLE access_links ADD COLUMN token_display TEXT;

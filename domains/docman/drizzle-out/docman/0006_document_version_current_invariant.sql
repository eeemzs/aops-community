-- Step 8 of docman set-current-version slice (consensus topic
-- aops-cli-doc-set-current-version-sugar-2026-05-18).
--
-- Enforces "at most one isCurrent=true row per (tenantId, documentId)" at the
-- database level. The new docman.document-version.set-current service op
-- already maintains this invariant inside its transaction, but a partial
-- unique index makes the invariant robust against future migrations, manual
-- SQL, or concurrent writers that might bypass the service path.
--
-- PostgreSQL supports partial unique indexes natively. SQLite supports the
-- same syntax, so the drizzle SQLite mirror can carry the same index.

CREATE UNIQUE INDEX IF NOT EXISTS "document_version_unique_current"
  ON "docman_document_versions" ("tenantId", "documentId")
  WHERE "isCurrent" = true;

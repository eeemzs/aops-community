# docman-kit

Docman kit package exposing repositories, services, operation contracts, DCM, and host projections.

## Repository Surface

- `documentRepository`
- `documentGroupRepository`
- `documentVersionRepository`
- `documentIndexEntryRepository`
- `sectionRepository`
- `pageRepository`
- `pageVersionRepository`
- `documentSectionLinkRepository`
- `sectionPageLinkRepository`
- `snippetRepository`
- `pageSnippetLinkRepository`
- `assetRepository`
- `assetVersionRepository`
- `embedRepository`
- `pageEmbedLinkRepository`

## Service Surface

- `documentService`
- `documentGroupService`
- `documentVersionService`
- `sectionService`
- `pageService`
- `pageVersionService`
- `documentSectionLinkService`
- `sectionPageLinkService`
- `snippetService`
- `pageSnippetLinkService`
- `assetService`
- `assetVersionService`
- `embedService`
- `pageEmbedLinkService`

## Env Variables

- `TENANT_ID`
- `LOG_LEVEL`
- `DOCMAN_REPO_URL` (opsiyonel, pg/sqlite)
- `DOCMAN_PG_URL` (opsiyonel)
- `DOCMAN_SQLITE_URL` (opsiyonel)
- `AOPS_PG_URL` (fallback)
- `DOCUMENT_REPO_URL`
- `DOCUMENT_GROUP_REPO_URL`
- `DOCUMENT_VERSION_REPO_URL`
- `SECTION_REPO_URL`
- `PAGE_REPO_URL`
- `PAGE_VERSION_REPO_URL`
- `DOCUMENT_SECTION_LINK_REPO_URL`
- `SECTION_PAGE_LINK_REPO_URL`
- `SNIPPET_REPO_URL`
- `PAGE_SNIPPET_LINK_REPO_URL`
- `ASSET_REPO_URL`
- `ASSET_VERSION_REPO_URL`
- `EMBED_REPO_URL`
- `PAGE_EMBED_LINK_REPO_URL`

## Notes

- `documentService` owns compose/render behavior.
- `documentService` also owns persisted retrieval index and summary build/get/search behavior.
- `sectionService` is container CRUD only.
- `pageVersionService` owns content records.
- Kit operations project to DCM and host routes from the same `catalog -> contract` chain.
- `document.index.build`, `document.index.get`, `document.search`, `document.summary.build`, `document.summary.get`, and `document.answer-pack` are the persisted retrieval surfaces for agents and hosts.
- `document.compose.fetch` is the canonical composed-source read surface and expects a flat payload.
- `document.publish.materialize` is the canonical text materialization surface for `markdown` and `html`.
- Materialize target selection is resolved through an internal target registry so future artifact exporters can extend the render pipeline without widening the generic invoke contract prematurely.
- Authored asset references should stay on `asset://<assetUid-or-slug>[@version]`; compose resolves publishable `sourceUrl` locators and does not leak raw storage paths.
- Materialize output is JSON-friendly and returns inline `content`, `mediaType`, `warnings`, and `assets`; download/binary export remains a separate future surface.
- Retrieval search is db-agnostic; it supports lexical, hybrid, and semantic ranking over persisted rows instead of requiring vendor-specific FTS/vector features.
- Retrieval summaries are also deterministic and db-agnostic; they are stored on persisted retrieval rows with source and summary counts rather than in separate summary tables.
- `document.answer-pack` adds citation-first answer selection with `matchedBy` and provenance fields; it can stay deterministic or synthesize a tighter top answer when a provider is configured.
- Runtime consumers that only need contracts, DCM, and host routes can import `@aopslab/domain-kit-docman/operations` instead of the package root.

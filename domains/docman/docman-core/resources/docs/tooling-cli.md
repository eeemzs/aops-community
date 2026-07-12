# Docman Tooling CLI Notes

## Input Shape

- CRUD create operations use `{ "data": { ... } }`
- CRUD update operations use `{ "id": "...", "patch": { ... } }`
- Compose operations use direct payload objects, not a nested `data` wrapper

## Important Constraints

- `document.compose.fetch` expects `documentVersionId` and may additionally target `sectionId`, `pageVersionId`, or `pageNumber`
- `document-section-link.create` may nest a section under another section
- `document-section-link.create` may attach a page at document root or under a section
- `document-section-link.create` must not attach a page under another page
- `section-page-link` is flat and keyed by `sectionId`
- `section-page-link.position` must be unique within the same `sectionId`

## Legacy Cleanup

- legacy section-only version CRUD is not a valid tooling surface
- legacy page-alias CRUD is not a valid tooling surface
- Section payloads only accept `sectionUid`, `title`, `titleMl`, `kind`, and `slug`

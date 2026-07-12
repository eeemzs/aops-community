# docman-dm

Docman domain model package.

## Entities

- `Document`
- `DocumentGroup`
- `DocumentVersion`
- `Section`
- `Page`
- `PageVersion`
- `DocumentSectionLink`
- `SectionPageLink`
- `Snippet`
- `PageSnippetLink`
- `Embed`
- `PageEmbedLink`

## Model Notes

- `Section` is a reusable container.
- `PageVersion` is the content record rendered into documents.
- `DocumentSectionLink` carries the document tree.
- `SectionPageLink` carries a flat page list per reusable section.
- There is no section version model in this package.

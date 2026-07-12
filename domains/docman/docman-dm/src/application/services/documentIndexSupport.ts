import { createHash } from 'node:crypto'

export const DOCMAN_DOCUMENT_INDEX_BUILD_ACTOR = 'docman.index.build'

function normalizeNonEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeDocmanDocumentIndexLocale(value: unknown): string {
  return normalizeNonEmpty(value)
}

export function slugifyDocmanDocumentIndexPart(value: unknown, fallback: string): string {
  const normalized = normalizeNonEmpty(value).toLowerCase()
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  return slug || fallback
}

export function buildDocmanDocumentAnchor(documentIdentity: unknown): string {
  return `document-${slugifyDocmanDocumentIndexPart(documentIdentity, 'document')}`
}

export function buildDocmanSectionAnchor(sectionIdentity: unknown, linkId: unknown): string {
  return `section-${slugifyDocmanDocumentIndexPart(sectionIdentity, 'section')}-${slugifyDocmanDocumentIndexPart(linkId, 'link')}`
}

export function buildDocmanPageAnchor(pageIdentity: unknown, linkId: unknown): string {
  return `page-${slugifyDocmanDocumentIndexPart(pageIdentity, 'page')}-${slugifyDocmanDocumentIndexPart(linkId, 'link')}`
}

export function buildDocmanDocumentIndexFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

import { randomUUID } from 'node:crypto'

import {
  resolveDocmanPageSourceFormat,
} from '@aopslab/domain-core-docman'
import { runDocmanKitOperationByTypedId } from '@aopslab/domain-kit-docman'
import { buildSafeDocumentLinkUpdateSequence } from './document-link-update-plan.js'

export type DocmanFlowAction =
  | 'save-group'
  | 'save-document'
  | 'save-section'
  | 'copy-section'
  | 'create-linked-page'
  | 'create-linked-section'
  | 'copy-page'
  | 'link-existing-section'
  | 'link-existing-page-version'
  | 'update-document-section-links'
  | 'update-section-page-links'
  | 'save-page-version-draft'
  | 'update-document-version'
  | 'update-page'
  | 'create-document-version'
  | 'create-page-with-initial-version'

export type CreateLinkedDocmanSectionFlowInput = {
  scopeId: string
  documentVersionId?: unknown
  parentLinkId?: unknown
}

export type CreateLinkedDocmanPageFlowInput = {
  scopeId: string
  documentVersionId?: unknown
  sectionId?: unknown
  parentLinkId?: unknown
  format?: unknown
}

export type LinkExistingDocmanSectionFlowInput = {
  scopeId: string
  documentVersionId?: unknown
  sectionId?: unknown
  parentLinkId?: unknown
  position?: unknown
  titleOverride?: unknown
  numbering?: unknown
}

export type LinkExistingDocmanPageVersionFlowInput = {
  scopeId: string
  sectionId?: unknown
  pageId?: unknown
  pageVersionId?: unknown
  position?: unknown
  titleOverride?: unknown
  numbering?: unknown
}

export type UpdateDocmanDocumentSectionLinksFlowInput = {
  scopeId: string
  documentVersionId?: unknown
  updates?: unknown
}

export type UpdateDocmanSectionPageLinksFlowInput = {
  scopeId: string
  sectionId?: unknown
  updates?: unknown
}

export type CreateDocmanDocumentVersionFlowInput = {
  scopeId: string
  documentId?: unknown
  data?: unknown
  documentInitMode?: unknown
  sourceVersionId?: unknown
  sourceSectionLinkIds?: unknown
}

export type SaveDocmanGroupFlowInput = {
  scopeId: string
  groupId?: unknown
  data?: unknown
}

export type SaveDocmanDocumentFlowInput = {
  scopeId: string
  documentId?: unknown
  data?: unknown
}

export type SaveDocmanSectionFlowInput = {
  scopeId: string
  sectionId?: unknown
  data?: unknown
}

export type CopyDocmanSectionFlowInput = {
  scopeId: string
  sourceSectionId?: unknown
  targetDocumentVersionId?: unknown
  parentLinkId?: unknown
  position?: unknown
  rename?: unknown
  clonePages?: unknown
}

export type UpdateDocmanDocumentVersionFlowInput = {
  scopeId: string
  documentVersionId?: unknown
  documentId?: unknown
  data?: unknown
}

export type UpdateDocmanPageFlowInput = {
  scopeId: string
  pageId?: unknown
  data?: unknown
}

export type CopyDocmanPageFlowInput = {
  scopeId: string
  sourcePageId?: unknown
  sourcePageVersionId?: unknown
  targetSectionId?: unknown
  position?: unknown
  rename?: unknown
  clonePage?: unknown
}

export type CreateDocmanPageWithInitialVersionFlowInput = {
  scopeId: string
  data?: unknown
}

export type SaveDocmanPageVersionDraftFlowInput = {
  scopeId: string
  pageVersionId?: unknown
  documentLinkId?: unknown
  data?: unknown
}

type DocmanLinkRecord = {
  id: string
  kind: 'section' | 'page'
  sectionId: string
  pageVersionId: string
  parentLinkId: string
  position: number
  depth: number
  titleOverride: string
  numbering: string
}

type SectionPageLinkRecord = {
  id: string
  sectionId: string
  pageVersionId: string
  parentLinkId: string
  position: number
  depth: number
  titleOverride: string
  numbering: string
}

type LinkUpdateRecord = {
  id: string
  patch: Record<string, unknown>
}

function normalizeNonEmpty(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function stripPageVersionSeedFields(value: Record<string, unknown>): Record<string, unknown> {
  const { format: _format, ...pageFields } = value
  return pageFields
}

function toItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  const record = toRecord(value)
  if (Array.isArray(record.items)) return record.items as T[]
  if (Array.isArray(record.data)) return record.data as T[]
  return []
}

function normalizeUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    const normalized = normalizeNonEmpty(item)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

function toItem<T>(value: unknown): T | null {
  const record = toRecord(value)
  if (record.item && typeof record.item === 'object' && !Array.isArray(record.item)) {
    return record.item as T
  }
  if (Array.isArray(record.items) || Array.isArray(record.data)) return null
  if (Object.keys(record).length > 0) return record as T
  return null
}

function extractId(value: unknown, keys: string[] = ['id']): string {
  if (typeof value === 'string') return normalizeNonEmpty(value)
  const record = toRecord(value)
  if (record.item && typeof record.item === 'object' && !Array.isArray(record.item)) {
    const nested = extractId(record.item, keys)
    if (nested) return nested
  }
  const directId = normalizeNonEmpty(record.id)
  if (directId) return directId
  for (const key of keys) {
    const candidate = normalizeNonEmpty(record[key])
    if (candidate) return candidate
  }
  return ''
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function inferLinkKind(link: Record<string, unknown>): 'section' | 'page' {
  const kind = normalizeNonEmpty(link.kind).toLowerCase()
  if (kind === 'page') return 'page'
  if (kind === 'section') return 'section'
  return normalizeNonEmpty(link.pageVersionId) ? 'page' : 'section'
}

function normalizeDocmanLink(link: unknown): DocmanLinkRecord {
  const record = toRecord(link)
  const positionValue = Number(record.position)
  const depthValue = Number(record.depth)
  return {
    id: normalizeNonEmpty(record.id) || normalizeNonEmpty(record.linkId),
    kind: inferLinkKind(record),
    sectionId: normalizeNonEmpty(record.sectionId),
    pageVersionId: normalizeNonEmpty(record.pageVersionId),
    parentLinkId: normalizeNonEmpty(record.parentLinkId),
    position: Number.isFinite(positionValue) ? positionValue : 0,
    depth: Number.isFinite(depthValue) ? Math.max(0, Math.floor(depthValue)) : 0,
    titleOverride: normalizeNonEmpty(record.titleOverride),
    numbering: normalizeNonEmpty(record.numbering),
  }
}

function getNextPosition(items: Array<{ position?: number }> = []): number {
  if (!Array.isArray(items) || items.length === 0) return 1
  return Math.max(...items.map((item) => Number(item?.position) || 0)) + 1
}

function resolvePosition(value: unknown, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.max(1, Math.floor(numeric))
}

function normalizeLinkUpdateRecords(
  value: unknown,
  patchNormalizer: (patch: Record<string, unknown>) => Record<string, unknown>,
): LinkUpdateRecord[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      const record = toRecord(entry)
      const id = normalizeNonEmpty(record.id)
      const patchRecord = toRecord(record.patch)
      if (!id || Object.keys(patchRecord).length === 0) return null
      return {
        id,
        patch: patchNormalizer(patchRecord),
      }
    })
    .filter((entry): entry is LinkUpdateRecord => Boolean(entry))
}

function normalizeDocumentSectionLinkUpdatePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const nextPatch: Record<string, unknown> = { ...patch }
  if (hasOwn(nextPatch, 'sectionId')) {
    const sectionId = normalizeNonEmpty(nextPatch.sectionId)
    if (sectionId) nextPatch.sectionId = sectionId
    else delete nextPatch.sectionId
  }
  if (hasOwn(nextPatch, 'pageVersionId')) {
    const pageVersionId = normalizeNonEmpty(nextPatch.pageVersionId)
    if (pageVersionId) nextPatch.pageVersionId = pageVersionId
    else delete nextPatch.pageVersionId
  }
  if (hasOwn(nextPatch, 'parentLinkId')) {
    nextPatch.parentLinkId = normalizeNonEmpty(nextPatch.parentLinkId)
  }
  if (hasOwn(nextPatch, 'position')) {
    nextPatch.position = resolvePosition(nextPatch.position, 1)
  }
  if (!normalizeNonEmpty(nextPatch.kind)) {
    if (normalizeNonEmpty(nextPatch.pageVersionId)) nextPatch.kind = 'page'
    else if (normalizeNonEmpty(nextPatch.sectionId)) nextPatch.kind = 'section'
  }
  return nextPatch
}

function normalizeSectionPageLinkUpdatePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const nextPatch: Record<string, unknown> = { ...patch }
  if (hasOwn(nextPatch, 'sectionId')) {
    const sectionId = normalizeNonEmpty(nextPatch.sectionId)
    if (sectionId) nextPatch.sectionId = sectionId
    else delete nextPatch.sectionId
  }
  if (hasOwn(nextPatch, 'pageVersionId')) {
    const pageVersionId = normalizeNonEmpty(nextPatch.pageVersionId)
    if (pageVersionId) nextPatch.pageVersionId = pageVersionId
    else delete nextPatch.pageVersionId
  }
  delete nextPatch.parentLinkId
  delete nextPatch.depth
  if (hasOwn(nextPatch, 'position')) {
    nextPatch.position = resolvePosition(nextPatch.position, 1)
  }
  return nextPatch
}

function normalizeDocmanPageVersionStatus(value: unknown): string {
  return normalizeNonEmpty(value).toLowerCase()
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true) return true
  if (value === false || value === undefined || value === null) return false
  const normalized = normalizeNonEmpty(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function isLockedDocmanPageVersionStatus(value: unknown): boolean {
  const normalized = normalizeDocmanPageVersionStatus(value)
  return normalized === 'published' || normalized === 'archived'
}

function buildSectionFlowTitle(documentTitle: string, sectionNumber = 1): string {
  return `${documentTitle || 'Document'} / Section ${sectionNumber}`
}

function buildPageFlowTitle(documentTitle: string, sectionNumber = 1, pageNumber = 1): string {
  return `${documentTitle || 'Document'} / Section ${sectionNumber} / Page ${pageNumber}`
}

function makeUid(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

async function runDocmanOperation(operationId: string, input: Record<string, unknown>): Promise<unknown> {
  return runDocmanKitOperationByTypedId(operationId as never, input as never)
}

async function loadDocumentVersion(scopeId: string, documentVersionId: string): Promise<Record<string, unknown>> {
  const result = await runDocmanOperation('document-version.get', {
    scopeId,
    id: documentVersionId,
  })
  const item = toItem<Record<string, unknown>>(result)
  if (item?.id) return item
  throw new Error('Document version could not be resolved.')
}

async function loadSection(scopeId: string, sectionId: string): Promise<Record<string, unknown>> {
  const result = await runDocmanOperation('section.get', {
    scopeId,
    id: sectionId,
  })
  const item = toItem<Record<string, unknown>>(result)
  if (item?.id) return item
  throw new Error('Section could not be resolved.')
}

async function loadDocument(scopeId: string, documentId: string): Promise<Record<string, unknown>> {
  const result = await runDocmanOperation('document.get', {
    scopeId,
    id: documentId,
  })
  const item = toItem<Record<string, unknown>>(result)
  if (item?.id) return item
  throw new Error('Document could not be resolved.')
}

async function loadPage(scopeId: string, pageId: string): Promise<Record<string, unknown>> {
  const result = await runDocmanOperation('page.get', {
    scopeId,
    id: pageId,
  })
  const item = toItem<Record<string, unknown>>(result)
  if (item?.id) return item
  throw new Error('Page could not be resolved.')
}

async function loadPageVersion(scopeId: string, pageVersionId: string): Promise<Record<string, unknown>> {
  const result = await runDocmanOperation('page-version.get', {
    scopeId,
    id: pageVersionId,
  })
  const item = toItem<Record<string, unknown>>(result)
  if (item?.id) return item
  throw new Error('Page version could not be resolved.')
}

async function loadDocumentTitle(
  scopeId: string,
  documentVersion: Record<string, unknown>,
): Promise<string> {
  const documentId = normalizeNonEmpty(documentVersion.documentId)
  if (!documentId) {
    return normalizeNonEmpty(documentVersion.title) || 'Document'
  }

  const result = await runDocmanOperation('document.get', {
    scopeId,
    id: documentId,
  })
  const item = toItem<Record<string, unknown>>(result)
  if (item?.id) {
    return normalizeNonEmpty(item.title) || normalizeNonEmpty(documentVersion.title) || 'Document'
  }

  throw new Error('Document could not be resolved.')
}

async function listDocumentLinks(scopeId: string, documentVersionId: string): Promise<DocmanLinkRecord[]> {
  const result = await runDocmanOperation('document-section-link.list', {
    scopeId,
    filter: { documentVersionId },
    options: { limit: 5000 },
  })
  return toItems<Record<string, unknown>>(result)
    .map((item) => normalizeDocmanLink(item))
    .filter((item) => Boolean(item.id))
}

async function listDocumentVersions(scopeId: string, documentId: string): Promise<Array<Record<string, unknown>>> {
  const result = await runDocmanOperation('document-version.list', {
    scopeId,
    filter: { documentId },
    options: { limit: 5000 },
  })
  return toItems<Record<string, unknown>>(result)
}

async function listDocuments(scopeId: string): Promise<Array<Record<string, unknown>>> {
  const result = await runDocmanOperation('document.list', {
    scopeId,
    filter: {},
    options: { limit: 5000, includeVersionInfo: true },
  })
  return toItems<Record<string, unknown>>(result)
}

async function listDocumentGroups(scopeId: string): Promise<Array<Record<string, unknown>>> {
  const result = await runDocmanOperation('document-group.list', {
    scopeId,
    filter: {},
    options: { limit: 5000 },
  })
  return toItems<Record<string, unknown>>(result)
}

async function listSections(scopeId: string): Promise<Array<Record<string, unknown>>> {
  const result = await runDocmanOperation('section.list', {
    scopeId,
    filter: {},
    options: { limit: 5000 },
  })
  return toItems<Record<string, unknown>>(result)
}

async function listPageVersions(scopeId: string, pageId: string): Promise<Array<Record<string, unknown>>> {
  const result = await runDocmanOperation('page-version.list', {
    scopeId,
    filter: { pageId },
    options: { limit: 5000 },
  })
  return toItems<Record<string, unknown>>(result)
}

function pickLatestPageVersion(versions: Array<Record<string, unknown>>): Record<string, unknown> | null {
  return versions
    .filter((version) => normalizeNonEmpty(version.id))
    .slice()
    .sort((left, right) => (Number(right.version) || 0) - (Number(left.version) || 0))[0] ?? null
}

async function listDocumentLinkUsageByPageVersionId(
  scopeId: string,
  pageVersionId: string,
): Promise<DocmanLinkRecord[]> {
  const result = await runDocmanOperation('document-section-link.list', {
    scopeId,
    filter: { pageVersionId },
    options: { limit: 5000 },
  })
  return toItems<Record<string, unknown>>(result)
    .map((item) => normalizeDocmanLink(item))
    .filter((item) => Boolean(item.id))
}

function resolveNextDocmanPageVersionNumber(
  versions: Array<Record<string, unknown>>,
  minimumVersion = 0,
): number {
  const maxExistingVersion = versions.reduce((maxVersion, version) => {
    const parsedVersion = Number(version.version)
    if (!Number.isFinite(parsedVersion)) return maxVersion
    return parsedVersion > maxVersion ? parsedVersion : maxVersion
  }, 0)
  return Math.max(maxExistingVersion + 1, minimumVersion)
}

function normalizeSectionPageLink(link: unknown): SectionPageLinkRecord {
  const record = toRecord(link)
  const positionValue = Number(record.position)
  const depthValue = Number(record.depth)
  return {
    id: normalizeNonEmpty(record.id) || normalizeNonEmpty(record.linkId),
    sectionId: normalizeNonEmpty(record.sectionId),
    pageVersionId: normalizeNonEmpty(record.pageVersionId),
    parentLinkId: normalizeNonEmpty(record.parentLinkId),
    position: Number.isFinite(positionValue) ? positionValue : 0,
    depth: Number.isFinite(depthValue) ? Math.max(0, Math.floor(depthValue)) : 0,
    titleOverride: normalizeNonEmpty(record.titleOverride),
    numbering: normalizeNonEmpty(record.numbering),
  }
}

async function listSectionPageLinks(scopeId: string, sectionId: string): Promise<SectionPageLinkRecord[]> {
  const result = await runDocmanOperation('section-page-link.list', {
    scopeId,
    filter: { sectionId },
    options: { limit: 5000 },
  })
  return toItems<Record<string, unknown>>(result)
    .map((item) => normalizeSectionPageLink(item))
    .filter((item) => Boolean(item.id))
}

async function listSectionPageLinkUsageByPageVersionId(
  scopeId: string,
  pageVersionId: string,
): Promise<SectionPageLinkRecord[]> {
  const result = await runDocmanOperation('section-page-link.list', {
    scopeId,
    filter: { pageVersionId },
    options: { limit: 5000 },
  })
  return toItems<Record<string, unknown>>(result)
    .map((item) => normalizeSectionPageLink(item))
    .filter((item) => Boolean(item.id))
}

function normalizeDocmanVersionInitMode(value: unknown): 'clean' | 'clone_all' | 'clone_selected' {
  const normalized = normalizeNonEmpty(value).toLowerCase()
  if (normalized === 'clone_all' || normalized === 'clone_selected') return normalized
  return 'clean'
}

function resolveParentSectionLink(
  links: DocmanLinkRecord[],
  parentLinkId: string,
  sectionId: string,
  pageMode = false,
): DocmanLinkRecord | null {
  if (parentLinkId) {
    const link = links.find((entry) => entry.id === parentLinkId) ?? null
    if (!link) {
      throw new Error('Selected parent section could not be resolved.')
    }
    if (link.kind !== 'section') {
      throw new Error(
        pageMode
          ? 'Pages cannot be nested under another page.'
          : 'Sections can only be nested under other sections.',
      )
    }
    return link
  }

  if (!sectionId) return null
  const link = links.find((entry) => entry.kind === 'section' && entry.sectionId === sectionId) ?? null
  if (!link) {
    throw new Error('Selected section could not be resolved in document outline.')
  }
  return link
}

export function normalizeDocmanFlowAction(value: unknown): DocmanFlowAction | '' {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().toLowerCase()
  return trimmed === 'save-group' ||
    trimmed === 'save-document' ||
    trimmed === 'save-section' ||
    trimmed === 'copy-section' ||
    trimmed === 'create-linked-section' ||
    trimmed === 'copy-page' ||
    trimmed === 'link-existing-section' ||
    trimmed === 'link-existing-page-version' ||
    trimmed === 'update-document-section-links' ||
    trimmed === 'update-section-page-links' ||
    trimmed === 'save-page-version-draft' ||
    trimmed === 'update-document-version' ||
    trimmed === 'update-page' ||
    trimmed === 'create-linked-page' ||
    trimmed === 'create-document-version' ||
    trimmed === 'create-page-with-initial-version'
    ? trimmed
    : ''
}

export function inferDocmanFlowErrorStatus(message: string): number {
  const normalized = message.trim().toLowerCase()
  if (normalized === 'unauthorized') return 401
  if (
    normalized === 'document version could not be resolved.' ||
    normalized === 'document could not be resolved.' ||
    normalized === 'section could not be resolved.' ||
    normalized === 'page version could not be resolved.' ||
    normalized === 'page could not be resolved.' ||
    normalized === 'group could not be resolved.' ||
    normalized === 'document section link could not be resolved.' ||
    normalized === 'section page link could not be resolved.'
  ) {
    return 404
  }
  if (normalized === 'section is already linked in document outline.') return 409
  if (normalized === 'page version is already linked in section.') return 409
  return 400
}

export async function saveDocmanGroupFlow(input: SaveDocmanGroupFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const payload = toRecord(input.data)
  const groupId = normalizeNonEmpty(input.groupId)

  if (!scopeId) throw new Error('Scope is required.')

  if (groupId) {
    await runDocmanOperation('document-group.update', {
      scopeId,
      id: groupId,
      patch: payload,
    })
    const groups = await listDocumentGroups(scopeId)
    const updatedGroup = groups.find((group) => normalizeNonEmpty(group.id) === groupId)
    if (!updatedGroup) throw new Error('Group could not be resolved.')

    return {
      action: 'save-group' as const,
      mode: 'edit' as const,
      groupId,
      group: {
        ...payload,
        ...updatedGroup,
        id: groupId,
      },
      focusGroupId: groupId,
    }
  }

  const createResult = await runDocmanOperation('document-group.create', {
    scopeId,
    data: payload,
  })

  let createdGroupId = extractId(createResult, ['groupId'])
  let createdGroup = toRecord(toItem<Record<string, unknown>>(createResult))
  if (!createdGroupId) {
    const groups = await listDocumentGroups(scopeId)
    const matchedGroup =
      groups.find((group) => normalizeNonEmpty(group.groupUid) === normalizeNonEmpty(payload.groupUid)) ??
      groups.find(
        (group) =>
          normalizeNonEmpty(group.title) === normalizeNonEmpty(payload.title) &&
          normalizeNonEmpty(group.parentGroupId) === normalizeNonEmpty(payload.parentGroupId),
      ) ??
      null
    createdGroupId = normalizeNonEmpty(matchedGroup?.id)
    createdGroup = matchedGroup ?? createdGroup
  }
  if (!createdGroupId) throw new Error('Group could not be resolved.')

  return {
    action: 'save-group' as const,
    mode: 'create' as const,
    groupId: createdGroupId,
    group: {
      ...payload,
      ...createdGroup,
      id: createdGroupId,
    },
    focusGroupId: createdGroupId,
  }
}

export async function saveDocmanDocumentFlow(input: SaveDocmanDocumentFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const payload = toRecord(input.data)
  const documentId = normalizeNonEmpty(input.documentId) || normalizeNonEmpty(payload.documentId)

  if (!scopeId) throw new Error('Scope is required.')

  if (documentId) {
    await runDocmanOperation('document.update', {
      scopeId,
      id: documentId,
      patch: payload,
    })
    const updatedDocument = await loadDocument(scopeId, documentId)
    return {
      action: 'save-document' as const,
      mode: 'edit' as const,
      documentId,
      document: {
        ...payload,
        ...updatedDocument,
        id: documentId,
      },
      focusDocumentId: documentId,
    }
  }

  const createResult = await runDocmanOperation('document.create', {
    scopeId,
    data: payload,
  })
  let createdDocumentId = extractId(createResult, ['documentId'])
  if (!createdDocumentId) {
    const documents = await listDocuments(scopeId)
    const matchedDocument =
      documents.find((document) => normalizeNonEmpty(document.documentUid) === normalizeNonEmpty(payload.documentUid)) ??
      documents.find((document) => normalizeNonEmpty(document.slug) === normalizeNonEmpty(payload.slug)) ??
      null
    createdDocumentId = normalizeNonEmpty(matchedDocument?.id)
  }
  if (!createdDocumentId) throw new Error('Document could not be resolved.')

  const createdDocument = await loadDocument(scopeId, createdDocumentId)
  return {
    action: 'save-document' as const,
    mode: 'create' as const,
    documentId: createdDocumentId,
    document: {
      ...payload,
      ...createdDocument,
      id: createdDocumentId,
    },
    focusDocumentId: createdDocumentId,
  }
}

export async function saveDocmanSectionFlow(input: SaveDocmanSectionFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const payload = toRecord(input.data)
  const sectionId = normalizeNonEmpty(input.sectionId) || normalizeNonEmpty(payload.sectionId)

  if (!scopeId) throw new Error('Scope is required.')

  if (sectionId) {
    await runDocmanOperation('section.update', {
      scopeId,
      id: sectionId,
      patch: payload,
    })
    const updatedSection = await loadSection(scopeId, sectionId)
    return {
      action: 'save-section' as const,
      mode: 'edit' as const,
      sectionId,
      section: {
        ...payload,
        ...updatedSection,
        id: sectionId,
      },
      sectionRecord: {
        ...payload,
        ...updatedSection,
        id: sectionId,
        sectionId,
      },
      focusSectionId: sectionId,
    }
  }

  const createResult = await runDocmanOperation('section.create', {
    scopeId,
    data: payload,
  })
  let createdSectionId = extractId(createResult, ['sectionId'])
  if (!createdSectionId) {
    const sections = await listSections(scopeId)
    const matchedSection =
      sections.find((section) => normalizeNonEmpty(section.sectionUid) === normalizeNonEmpty(payload.sectionUid)) ??
      sections.find((section) => normalizeNonEmpty(section.slug) === normalizeNonEmpty(payload.slug)) ??
      null
    createdSectionId = normalizeNonEmpty(matchedSection?.id)
  }
  if (!createdSectionId) throw new Error('Section could not be resolved.')

  const createdSection = await loadSection(scopeId, createdSectionId)
  return {
    action: 'save-section' as const,
    mode: 'create' as const,
    sectionId: createdSectionId,
    section: {
      ...payload,
      ...createdSection,
      id: createdSectionId,
    },
    sectionRecord: {
      ...payload,
      ...createdSection,
      id: createdSectionId,
      sectionId: createdSectionId,
    },
    focusSectionId: createdSectionId,
  }
}

async function createClonedPageWithVersion(params: {
  scopeId: string
  sourcePageId: string
  sourcePageVersion: Record<string, unknown>
  rename?: string
}): Promise<{
  pageId: string
  pageVersionId: string
  page: Record<string, unknown>
  pageVersion: Record<string, unknown>
}> {
  const sourcePage = await loadPage(params.scopeId, params.sourcePageId)
  const title = params.rename || normalizeNonEmpty(sourcePage.title) || normalizeNonEmpty(params.sourcePageVersion.title) || 'Copied page'
  const pageResult = await runDocmanOperation('page.create', {
    scopeId: params.scopeId,
    data: {
      pageUid: makeUid('PAG'),
      title,
      kind: normalizeNonEmpty(sourcePage.kind) || 'content',
    },
  })
  const pageId = extractId(pageResult, ['pageId'])
  if (!pageId) throw new Error('Page was created but could not be resolved.')

  const versionResult = await runDocmanOperation('page-version.create', {
    scopeId: params.scopeId,
    data: {
      pageId,
      version: 1,
      status: normalizeNonEmpty(params.sourcePageVersion.status) || 'draft',
      title: params.rename || normalizeNonEmpty(params.sourcePageVersion.title) || title,
      format: resolveDocmanPageSourceFormat(params.sourcePageVersion.format),
      content: typeof params.sourcePageVersion.content === 'string' ? params.sourcePageVersion.content : '',
    },
  })
  const pageVersionId = extractId(versionResult, ['pageVersionId'])
  if (!pageVersionId) throw new Error('Page version could not be resolved.')

  return {
    pageId,
    pageVersionId,
    page: { ...sourcePage, id: pageId, pageUid: normalizeNonEmpty(toRecord(pageResult).pageUid), title },
    pageVersion: { ...params.sourcePageVersion, id: pageVersionId, pageId, version: 1 },
  }
}

export async function copyDocmanSectionFlow(input: CopyDocmanSectionFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const sourceSectionId = normalizeNonEmpty(input.sourceSectionId)
  const targetDocumentVersionId = normalizeNonEmpty(input.targetDocumentVersionId)
  const parentLinkId = normalizeNonEmpty(input.parentLinkId)
  const rename = normalizeNonEmpty(input.rename)
  const clonePages = normalizeBoolean(input.clonePages)

  if (!scopeId) throw new Error('Scope is required.')
  if (!sourceSectionId) throw new Error('Section is required.')
  if (!targetDocumentVersionId) throw new Error('Document version is required.')

  await loadDocumentVersion(scopeId, targetDocumentVersionId)
  const sourceSection = await loadSection(scopeId, sourceSectionId)
  const targetDocumentLinks = await listDocumentLinks(scopeId, targetDocumentVersionId)
  const parentLink = resolveParentSectionLink(targetDocumentLinks, parentLinkId, '', false)
  const siblingLinks = targetDocumentLinks.filter((entry) => entry.parentLinkId === (parentLink?.id ?? ''))
  const position = resolvePosition(input.position, getNextPosition(siblingLinks))
  const depth = parentLink ? parentLink.depth + 1 : 0
  const title = rename || normalizeNonEmpty(sourceSection.title) || 'Copied section'

  const sectionResult = await runDocmanOperation('section.create', {
    scopeId,
    data: {
      sectionUid: makeUid('SEC'),
      title,
      kind: normalizeNonEmpty(sourceSection.kind) || 'container',
    },
  })
  const sectionId = extractId(sectionResult, ['sectionId'])
  if (!sectionId) throw new Error('Section was created but could not be resolved.')

  const sourceSectionPageLinks = (await listSectionPageLinks(scopeId, sourceSectionId))
    .slice()
    .sort((left, right) => left.position - right.position)
  const createdSectionPageLinks: SectionPageLinkRecord[] = []
  const clonedPages: Array<Record<string, unknown>> = []

  for (const sourceLink of sourceSectionPageLinks) {
    let targetPageVersionId = sourceLink.pageVersionId
    if (clonePages) {
      const sourcePageVersion = await loadPageVersion(scopeId, sourceLink.pageVersionId)
      const sourcePageId = normalizeNonEmpty(sourcePageVersion.pageId)
      if (!sourcePageId) throw new Error('Page could not be resolved.')
      const cloned = await createClonedPageWithVersion({
        scopeId,
        sourcePageId,
        sourcePageVersion,
      })
      targetPageVersionId = cloned.pageVersionId
      clonedPages.push({
        page: cloned.page,
        pageVersion: cloned.pageVersion,
        sourcePageVersionId: sourceLink.pageVersionId,
      })
    }

    const linkResult = await runDocmanOperation('section-page-link.create', {
      scopeId,
      data: {
        sectionId,
        pageVersionId: targetPageVersionId,
        position: sourceLink.position,
        depth: sourceLink.depth,
        titleOverride: sourceLink.titleOverride || undefined,
        numbering: sourceLink.numbering || undefined,
      },
    })
    createdSectionPageLinks.push({
      ...sourceLink,
      id: extractId(linkResult, ['sectionPageLinkId', 'linkId']),
      sectionId,
      pageVersionId: targetPageVersionId,
    })
  }

  const documentLinkResult = await runDocmanOperation('document-section-link.create', {
    scopeId,
    data: {
      documentVersionId: targetDocumentVersionId,
      kind: 'section',
      sectionId,
      parentLinkId: parentLink?.id || undefined,
      position,
      depth,
      titleOverride: !clonePages && rename ? rename : undefined,
    },
  })
  const documentLinkId = extractId(documentLinkResult, ['documentSectionLinkId', 'linkId'])

  return {
    action: 'copy-section' as const,
    mode: clonePages ? 'clone-pages' as const : 'reuse-pages' as const,
    sourceSectionId,
    targetDocumentVersionId,
    sectionId,
    section: {
      ...sourceSection,
      id: sectionId,
      title,
    },
    documentSectionLink: {
      id: documentLinkId,
      documentVersionId: targetDocumentVersionId,
      sectionId,
      parentLinkId: parentLink?.id ?? '',
      position,
      depth,
    },
    sectionPageLinks: createdSectionPageLinks,
    clonedPages,
    focusSectionId: sectionId,
  }
}

export async function createLinkedDocmanSection(input: CreateLinkedDocmanSectionFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const documentVersionId = normalizeNonEmpty(input.documentVersionId)
  const parentLinkId = normalizeNonEmpty(input.parentLinkId)

  if (!scopeId) throw new Error('Scope is required.')
  if (!documentVersionId) throw new Error('Document version is required.')

  const documentVersion = await loadDocumentVersion(scopeId, documentVersionId)
  const documentTitle = await loadDocumentTitle(scopeId, documentVersion)
  const links = await listDocumentLinks(scopeId, documentVersionId)
  const parentLink = resolveParentSectionLink(links, parentLinkId, '', false)
  const siblingLinks = links.filter((entry) => entry.parentLinkId === (parentLink?.id ?? ''))
  const sectionNumber = getNextPosition(siblingLinks)
  const title = buildSectionFlowTitle(documentTitle, sectionNumber)
  const sectionUid = makeUid('SEC')

  const sectionResult = await runDocmanOperation('section.create', {
    scopeId,
    data: {
      sectionUid,
      title,
      kind: 'container',
    },
  })
  const sectionId = extractId(sectionResult, ['sectionId'])
  if (!sectionId) {
    throw new Error('Section was created but could not be resolved.')
  }

  const depth = parentLink ? parentLink.depth + 1 : 0
  const linkResult = await runDocmanOperation('document-section-link.create', {
    scopeId,
    data: {
      documentVersionId,
      kind: 'section',
      sectionId,
      parentLinkId: parentLink?.id || undefined,
      position: sectionNumber,
      depth,
    },
  })
  const linkId = extractId(linkResult, ['documentSectionLinkId', 'linkId'])

  return {
    action: 'create-linked-section' as const,
    documentVersionId,
    section: {
      id: sectionId,
      sectionUid,
      title,
      kind: 'container',
    },
    link: {
      id: linkId,
      parentLinkId: parentLink?.id ?? '',
      position: sectionNumber,
      depth,
      kind: 'section' as const,
    },
  }
}

export async function linkExistingDocmanSection(input: LinkExistingDocmanSectionFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const documentVersionId = normalizeNonEmpty(input.documentVersionId)
  const sectionId = normalizeNonEmpty(input.sectionId)
  const parentLinkId = normalizeNonEmpty(input.parentLinkId)
  const titleOverride = normalizeNonEmpty(input.titleOverride)
  const numbering = normalizeNonEmpty(input.numbering)

  if (!scopeId) throw new Error('Scope is required.')
  if (!documentVersionId) throw new Error('Document version is required.')
  if (!sectionId) throw new Error('Section is required.')

  await loadDocumentVersion(scopeId, documentVersionId)
  const section = await loadSection(scopeId, sectionId)
  const links = await listDocumentLinks(scopeId, documentVersionId)
  if (links.some((entry) => entry.kind === 'section' && entry.sectionId === sectionId)) {
    throw new Error('Section is already linked in document outline.')
  }

  const parentLink = resolveParentSectionLink(links, parentLinkId, '', false)
  const siblingLinks = links.filter((entry) => entry.parentLinkId === (parentLink?.id ?? ''))
  const position = resolvePosition(input.position, getNextPosition(siblingLinks))
  const depth = parentLink ? parentLink.depth + 1 : 0

  const linkResult = await runDocmanOperation('document-section-link.create', {
    scopeId,
    data: {
      documentVersionId,
      kind: 'section',
      sectionId,
      parentLinkId: parentLink?.id || undefined,
      position,
      depth,
      titleOverride: titleOverride || undefined,
      numbering: numbering || undefined,
    },
  })
  const linkId = extractId(linkResult, ['documentSectionLinkId', 'linkId'])
  const documentSectionLinks = await listDocumentLinks(scopeId, documentVersionId)

  return {
    action: 'link-existing-section' as const,
    documentVersionId,
    documentSectionLinks,
    section: {
      id: sectionId,
      sectionUid: normalizeNonEmpty(section.sectionUid),
      title: normalizeNonEmpty(section.title),
      kind: normalizeNonEmpty(section.kind) || 'container',
    },
    link: {
      id: linkId,
      parentLinkId: parentLink?.id ?? '',
      position,
      depth,
      titleOverride,
      numbering,
      kind: 'section' as const,
    },
  }
}

export async function linkExistingDocmanPageVersion(input: LinkExistingDocmanPageVersionFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const sectionId = normalizeNonEmpty(input.sectionId)
  const explicitPageId = normalizeNonEmpty(input.pageId)
  const explicitPageVersionId = normalizeNonEmpty(input.pageVersionId)
  const titleOverride = normalizeNonEmpty(input.titleOverride)
  const numbering = normalizeNonEmpty(input.numbering)

  if (!scopeId) throw new Error('Scope is required.')
  if (!sectionId) throw new Error('Section is required.')
  if (!explicitPageId && !explicitPageVersionId) {
    throw new Error('Page or page version is required.')
  }

  await loadSection(scopeId, sectionId)

  const pageVersion =
    explicitPageVersionId
      ? await loadPageVersion(scopeId, explicitPageVersionId)
      : (() => null)()

  let resolvedPageVersion = pageVersion
  if (!resolvedPageVersion) {
    const versions = await listPageVersions(scopeId, explicitPageId)
    const sortedVersions = versions
      .filter((version) => normalizeNonEmpty(version.id))
      .slice()
      .sort((left, right) => (Number(right.version) || 0) - (Number(left.version) || 0))
    resolvedPageVersion = sortedVersions[0] ?? null
  }

  const pageVersionId = normalizeNonEmpty(resolvedPageVersion?.id)
  if (!pageVersionId) {
    throw new Error('Page version could not be resolved.')
  }

  const links = await listSectionPageLinks(scopeId, sectionId)
  if (links.some((entry) => entry.pageVersionId === pageVersionId)) {
    throw new Error('Page version is already linked in section.')
  }

  const position = resolvePosition(input.position, getNextPosition(links))
  const linkResult = await runDocmanOperation('section-page-link.create', {
    scopeId,
    data: {
      sectionId,
      pageVersionId,
      position,
      depth: 0,
      titleOverride: titleOverride || undefined,
      numbering: numbering || undefined,
    },
  })
  const linkId = extractId(linkResult, ['sectionPageLinkId', 'linkId'])
  const sectionPageLinks = await listSectionPageLinks(scopeId, sectionId)

  return {
    action: 'link-existing-page-version' as const,
    sectionId,
    pageVersionId,
    sectionPageLinks,
    pageVersion: {
      id: pageVersionId,
      pageId: normalizeNonEmpty(resolvedPageVersion?.pageId) || explicitPageId,
      version: Number(resolvedPageVersion?.version) || 0,
      status: normalizeNonEmpty(resolvedPageVersion?.status),
      title: normalizeNonEmpty(resolvedPageVersion?.title),
      format: normalizeNonEmpty(resolvedPageVersion?.format),
    },
    link: {
      id: linkId,
      sectionId,
      pageVersionId,
      parentLinkId: '',
      position,
      depth: 0,
      titleOverride,
      numbering,
    },
  }
}

export async function updateDocmanDocumentSectionLinksFlow(input: UpdateDocmanDocumentSectionLinksFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const documentVersionId = normalizeNonEmpty(input.documentVersionId)

  if (!scopeId) throw new Error('Scope is required.')
  if (!documentVersionId) throw new Error('Document version is required.')

  const currentLinks = await listDocumentLinks(scopeId, documentVersionId)
  const currentLinkIds = new Set(currentLinks.map((link) => normalizeNonEmpty(link.id)).filter(Boolean))
  const updates = normalizeLinkUpdateRecords(input.updates, normalizeDocumentSectionLinkUpdatePatch)

  if (updates.some((update) => !currentLinkIds.has(update.id))) {
    throw new Error('Document section link could not be resolved.')
  }

  if (updates.length === 0) {
    return {
      action: 'update-document-section-links' as const,
      documentVersionId,
      documentSectionLinks: currentLinks,
      updatedLinkIds: [] as string[],
    }
  }

  const safeUpdateSequence = buildSafeDocumentLinkUpdateSequence(
    currentLinks as Array<Record<string, unknown>>,
    updates,
  )

  for (const update of safeUpdateSequence) {
    await runDocmanOperation('document-section-link.update', {
      scopeId,
      id: update.id,
      patch: update.patch,
    })
  }

  const documentSectionLinks = await listDocumentLinks(scopeId, documentVersionId)
  return {
    action: 'update-document-section-links' as const,
    documentVersionId,
    documentSectionLinks,
    updatedLinkIds: updates.map((update) => update.id),
  }
}

export async function updateDocmanSectionPageLinksFlow(input: UpdateDocmanSectionPageLinksFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const sectionId = normalizeNonEmpty(input.sectionId)

  if (!scopeId) throw new Error('Scope is required.')
  if (!sectionId) throw new Error('Section is required.')

  const currentLinks = await listSectionPageLinks(scopeId, sectionId)
  const currentLinkIds = new Set(currentLinks.map((link) => normalizeNonEmpty(link.id)).filter(Boolean))
  const updates = normalizeLinkUpdateRecords(input.updates, normalizeSectionPageLinkUpdatePatch)

  if (updates.some((update) => !currentLinkIds.has(update.id))) {
    throw new Error('Section page link could not be resolved.')
  }

  if (updates.length === 0) {
    return {
      action: 'update-section-page-links' as const,
      sectionId,
      sectionPageLinks: currentLinks,
      updatedLinkIds: [] as string[],
    }
  }

  await Promise.all(
    updates.map((update) =>
      runDocmanOperation('section-page-link.update', {
        scopeId,
        id: update.id,
        patch: update.patch,
      }),
    ),
  )

  const sectionPageLinks = await listSectionPageLinks(scopeId, sectionId)
  return {
    action: 'update-section-page-links' as const,
    sectionId,
    sectionPageLinks,
    updatedLinkIds: updates.map((update) => update.id),
  }
}

export async function saveDocmanPageVersionDraftFlow(input: SaveDocmanPageVersionDraftFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const payload = toRecord(input.data)
  const pageVersionId = normalizeNonEmpty(input.pageVersionId)
  const documentLinkId = normalizeNonEmpty(input.documentLinkId)
  const pageId = normalizeNonEmpty(payload.pageId)

  if (!scopeId) throw new Error('Scope is required.')

  if (pageVersionId) {
    const persistedVersion = await loadPageVersion(scopeId, pageVersionId)
    const resolvedPageId = normalizeNonEmpty(persistedVersion.pageId) || pageId
    const isLocked = isLockedDocmanPageVersionStatus(persistedVersion.status)
    const [documentLinkUsages, sectionPageLinkUsages] = await Promise.all([
      listDocumentLinkUsageByPageVersionId(scopeId, pageVersionId),
      listSectionPageLinkUsageByPageVersionId(scopeId, pageVersionId),
    ])
    const hasExternalDocumentUsage = documentLinkId
      ? documentLinkUsages.some((link) => link.id !== documentLinkId)
      : documentLinkUsages.length > 1
    const shouldFork = isLocked || hasExternalDocumentUsage || sectionPageLinkUsages.length > 0

    if (!shouldFork) {
      await runDocmanOperation('page-version.update', {
        scopeId,
        id: pageVersionId,
        patch: payload,
      })

      const updatedVersion = await loadPageVersion(scopeId, pageVersionId)
      return {
        action: 'save-page-version-draft' as const,
        mode: 'edit' as const,
        pageId: normalizeNonEmpty(updatedVersion.pageId) || resolvedPageId,
        pageVersionId,
        pageVersion: {
          id: pageVersionId,
          pageId: normalizeNonEmpty(updatedVersion.pageId) || resolvedPageId,
          version: Number(updatedVersion.version) || Number(payload.version) || 0,
          status: normalizeNonEmpty(updatedVersion.status),
          title: normalizeNonEmpty(updatedVersion.title),
          format: normalizeNonEmpty(updatedVersion.format),
        },
      }
    }

    if (!resolvedPageId) throw new Error('Page is required.')

    const existingVersions = await listPageVersions(scopeId, resolvedPageId)
    const forkVersionNumber = resolveNextDocmanPageVersionNumber(existingVersions, Number(payload.version) || 0)
    const createPayload = {
      ...payload,
      pageId: resolvedPageId,
      version: forkVersionNumber,
    }
    const createResult = await runDocmanOperation('page-version.create', {
      scopeId,
      data: createPayload,
    })

    let createdPageVersionId = extractId(createResult, ['pageVersionId'])
    if (!createdPageVersionId) {
      const matchedVersion =
        existingVersions.find(
          (version) => normalizeNonEmpty(version.id) && Number(version.version) === forkVersionNumber,
        ) ?? null
      createdPageVersionId = normalizeNonEmpty(matchedVersion?.id)
    }
    if (!createdPageVersionId) {
      const refreshedVersions = await listPageVersions(scopeId, resolvedPageId)
      const matchedVersion =
        refreshedVersions.find(
          (version) => normalizeNonEmpty(version.id) && Number(version.version) === forkVersionNumber,
        ) ?? refreshedVersions.find((version) => normalizeNonEmpty(version.id))
      createdPageVersionId = normalizeNonEmpty(matchedVersion?.id)
    }
    if (!createdPageVersionId) {
      throw new Error('Page version could not be resolved.')
    }

    if (documentLinkId) {
      await runDocmanOperation('document-section-link.update', {
        scopeId,
        id: documentLinkId,
        patch: {
          pageVersionId: createdPageVersionId,
        },
      })
    }

    const createdVersion = await loadPageVersion(scopeId, createdPageVersionId)
    return {
      action: 'save-page-version-draft' as const,
      mode: 'fork' as const,
      pageId: normalizeNonEmpty(createdVersion.pageId) || resolvedPageId,
      pageVersionId: createdPageVersionId,
      sourcePageVersionId: pageVersionId,
      relinkedDocumentLinkId: documentLinkId,
      pageVersion: {
        id: createdPageVersionId,
        pageId: normalizeNonEmpty(createdVersion.pageId) || resolvedPageId,
        version: Number(createdVersion.version) || forkVersionNumber,
        status: normalizeNonEmpty(createdVersion.status),
        title: normalizeNonEmpty(createdVersion.title),
        format: normalizeNonEmpty(createdVersion.format),
      },
    }
  }

  if (!pageId) throw new Error('Page is required.')

  const createResult = await runDocmanOperation('page-version.create', {
    scopeId,
    data: payload,
  })

  let createdPageVersionId = extractId(createResult, ['pageVersionId'])
  if (!createdPageVersionId) {
    const targetVersion = Number(payload.version)
    const versions = await listPageVersions(scopeId, pageId)
    const matchedVersion =
      versions.find((version) => normalizeNonEmpty(version.id) && Number(version.version) === targetVersion) ??
      versions.find((version) => normalizeNonEmpty(version.id))
    createdPageVersionId = normalizeNonEmpty(matchedVersion?.id)
  }

  if (!createdPageVersionId) {
    throw new Error('Page version could not be resolved.')
  }

  const createdVersion = await loadPageVersion(scopeId, createdPageVersionId)
  return {
    action: 'save-page-version-draft' as const,
    mode: 'create' as const,
    pageId: normalizeNonEmpty(createdVersion.pageId) || pageId,
    pageVersionId: createdPageVersionId,
    pageVersion: {
      id: createdPageVersionId,
      pageId: normalizeNonEmpty(createdVersion.pageId) || pageId,
      version: Number(createdVersion.version) || Number(payload.version) || 0,
      status: normalizeNonEmpty(createdVersion.status),
      title: normalizeNonEmpty(createdVersion.title),
      format: normalizeNonEmpty(createdVersion.format),
    },
  }
}

export async function createLinkedDocmanPage(input: CreateLinkedDocmanPageFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const documentVersionId = normalizeNonEmpty(input.documentVersionId)
  const targetSectionId = normalizeNonEmpty(input.sectionId)
  const explicitParentLinkId = normalizeNonEmpty(input.parentLinkId)
  const pageFormat = resolveDocmanPageSourceFormat(input.format)

  if (!scopeId) throw new Error('Scope is required.')
  if (!documentVersionId) throw new Error('Document version is required.')

  const documentVersion = await loadDocumentVersion(scopeId, documentVersionId)
  const documentTitle = await loadDocumentTitle(scopeId, documentVersion)
  const links = await listDocumentLinks(scopeId, documentVersionId)
  const parentLink = resolveParentSectionLink(links, explicitParentLinkId, targetSectionId, true)
  const resolvedParentLinkId = parentLink?.id ?? ''
  const siblingLinks = links.filter((entry) => entry.parentLinkId === resolvedParentLinkId)
  const pageNumber = getNextPosition(siblingLinks)
  const sectionNumber = parentLink?.position || 1
  const title = resolvedParentLinkId
    ? buildPageFlowTitle(documentTitle, sectionNumber, pageNumber)
    : `${documentTitle || 'Document'} / Page ${pageNumber}`
  const pageUid = makeUid('PAG')

  const pageResult = await runDocmanOperation('page.create', {
    scopeId,
    data: {
      pageUid,
      title,
      kind: 'content',
    },
  })
  const pageId = extractId(pageResult, ['pageId'])
  if (!pageId) {
    throw new Error('Page was created but could not be resolved.')
  }

  const pageVersionResult = await runDocmanOperation('page-version.create', {
    scopeId,
    data: {
      pageId,
      version: 1,
      status: 'draft',
      title,
      format: pageFormat,
      content: '',
    },
  })
  const pageVersionId = extractId(pageVersionResult, ['pageVersionId'])
  if (!pageVersionId) {
    throw new Error('Page version could not be resolved.')
  }

  const depth = parentLink ? parentLink.depth + 1 : 0
  const linkResult = await runDocmanOperation('document-section-link.create', {
    scopeId,
    data: {
      documentVersionId,
      kind: 'page',
      pageVersionId,
      parentLinkId: resolvedParentLinkId || undefined,
      position: pageNumber,
      depth,
    },
  })
  const linkId = extractId(linkResult, ['documentSectionLinkId', 'linkId'])

  return {
    action: 'create-linked-page' as const,
    documentVersionId,
    sectionId: targetSectionId || parentLink?.sectionId || '',
    page: {
      id: pageId,
      pageUid,
      title,
      kind: 'content',
    },
    pageVersion: {
      id: pageVersionId,
      pageId,
      version: 1,
      status: 'draft',
      title,
      format: pageFormat,
    },
    link: {
      id: linkId,
      parentLinkId: resolvedParentLinkId,
      position: pageNumber,
      depth,
      kind: 'page' as const,
    },
  }
}

export async function createDocmanDocumentVersionFlow(input: CreateDocmanDocumentVersionFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const payload = toRecord(input.data)
  const documentId = normalizeNonEmpty(input.documentId) || normalizeNonEmpty(payload.documentId)
  const documentInitMode = normalizeDocmanVersionInitMode(input.documentInitMode)
  const sourceVersionId = normalizeNonEmpty(input.sourceVersionId)

  if (!scopeId) throw new Error('Scope is required.')
  if (!documentId) throw new Error('Document is required.')

  const createResult = await runDocmanOperation('document-version.create', {
    scopeId,
    data: payload,
  })
  const createdDocumentVersionRecord = toRecord(toItem<Record<string, unknown>>(createResult))

  let createdDocumentVersionId = extractId(createResult, ['documentVersionId'])
  if (!createdDocumentVersionId) {
    const targetVersion = Number(payload.version)
    const versions = await listDocumentVersions(scopeId, documentId)
    const matchedVersion =
      versions.find((version) => normalizeNonEmpty(version.id) && Number(version.version) === targetVersion) ??
      versions.find((version) => normalizeNonEmpty(version.id))
    createdDocumentVersionId = normalizeNonEmpty(matchedVersion?.id)
  }

  if (!createdDocumentVersionId) {
    throw new Error('Created document version could not be resolved.')
  }

  let clonedLinkCount = 0
  const createdDocumentSectionLinks: Array<Record<string, unknown>> = []
  if (documentInitMode !== 'clean') {
    if (!sourceVersionId) throw new Error('Source version is required.')

    const loadedSourceLinks = await listDocumentLinks(scopeId, sourceVersionId)
    const sourceLinksToClone =
      documentInitMode === 'clone_selected'
        ? (() => {
            const selectedIds = new Set(normalizeUniqueStringList(input.sourceSectionLinkIds))
            const selectedLinks = loadedSourceLinks.filter((link) => selectedIds.has(normalizeNonEmpty(link.id)))
            if (loadedSourceLinks.length > 0 && selectedLinks.length === 0) {
              throw new Error('Select at least one section for the new version.')
            }
            return selectedLinks
          })()
        : loadedSourceLinks

    const orderedSourceLinks = sourceLinksToClone
      .slice()
      .sort((a, b) => {
        const depthDiff = (Number(a.depth) || 0) - (Number(b.depth) || 0)
        if (depthDiff !== 0) return depthDiff
        return (Number(a.position) || 0) - (Number(b.position) || 0)
      })

    const sourceToNewLinkMap = new Map<string, string>()
    for (const sourceLink of orderedSourceLinks) {
      const sourceLinkId = normalizeNonEmpty(sourceLink.id)
      if (!sourceLinkId) continue

      const sourceParentId = normalizeNonEmpty(sourceLink.parentLinkId)
      const parentLinkId =
        sourceParentId && sourceToNewLinkMap.has(sourceParentId) ? sourceToNewLinkMap.get(sourceParentId) : undefined

      const createdLinkResult = await runDocmanOperation('document-section-link.create', {
        scopeId,
        data: {
          documentVersionId: createdDocumentVersionId,
          kind: sourceLink.kind,
          sectionId: sourceLink.sectionId || undefined,
          pageVersionId: sourceLink.pageVersionId || undefined,
          parentLinkId,
          position: Number(sourceLink.position) || 0,
          depth: Number.isFinite(Number(sourceLink.depth)) ? Number(sourceLink.depth) : undefined,
          titleOverride: sourceLink.titleOverride || undefined,
          numbering: sourceLink.numbering || undefined,
        },
      })
      const createdLinkId = extractId(createdLinkResult, ['documentSectionLinkId', 'linkId'])
      if (createdLinkId) {
        sourceToNewLinkMap.set(sourceLinkId, createdLinkId)
      }
      createdDocumentSectionLinks.push({
        ...sourceLink,
        id: createdLinkId || sourceLinkId,
        documentVersionId: createdDocumentVersionId,
        parentLinkId: parentLinkId || '',
      })
      clonedLinkCount += 1
    }
  }

  const createdDocumentVersion = {
    ...payload,
    ...createdDocumentVersionRecord,
    id: createdDocumentVersionId,
    documentId: normalizeNonEmpty(createdDocumentVersionRecord.documentId) || documentId,
  }

  return {
    action: 'create-document-version' as const,
    documentId,
    documentVersionId: createdDocumentVersionId,
    documentVersion: createdDocumentVersion,
    documentSectionLinks: createdDocumentSectionLinks,
    focusDocumentVersionId: createdDocumentVersionId,
    documentInitMode,
    sourceVersionId,
    clonedLinkCount,
  }
}

export async function updateDocmanDocumentVersionFlow(input: UpdateDocmanDocumentVersionFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const documentVersionId = normalizeNonEmpty(input.documentVersionId)
  const payload = toRecord(input.data)
  const documentId = normalizeNonEmpty(input.documentId) || normalizeNonEmpty(payload.documentId)

  if (!scopeId) throw new Error('Scope is required.')
  if (!documentVersionId) throw new Error('Document version is required.')

  await runDocmanOperation('document-version.update', {
    scopeId,
    id: documentVersionId,
    patch: payload,
  })

  const updatedDocumentVersion = await loadDocumentVersion(scopeId, documentVersionId)

  return {
    action: 'update-document-version' as const,
    documentId: normalizeNonEmpty(updatedDocumentVersion.documentId) || documentId,
    documentVersionId,
    documentVersion: {
      ...payload,
      ...updatedDocumentVersion,
      id: documentVersionId,
    },
    focusDocumentVersionId: documentVersionId,
  }
}

export async function updateDocmanPageFlow(input: UpdateDocmanPageFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const pageId = normalizeNonEmpty(input.pageId)
  const payload = toRecord(input.data)

  if (!scopeId) throw new Error('Scope is required.')
  if (!pageId) throw new Error('Page is required.')

  await runDocmanOperation('page.update', {
    scopeId,
    id: pageId,
    patch: payload,
  })

  const updatedPage = await loadPage(scopeId, pageId)
  return {
    action: 'update-page' as const,
    pageId,
    page: {
      ...payload,
      ...updatedPage,
      id: pageId,
    },
    focusPageId: pageId,
  }
}

export async function copyDocmanPageFlow(input: CopyDocmanPageFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const sourcePageId = normalizeNonEmpty(input.sourcePageId)
  const sourcePageVersionId = normalizeNonEmpty(input.sourcePageVersionId)
  const targetSectionId = normalizeNonEmpty(input.targetSectionId)
  const rename = normalizeNonEmpty(input.rename)
  const clonePage = normalizeBoolean(input.clonePage)

  if (!scopeId) throw new Error('Scope is required.')
  if (!sourcePageId && !sourcePageVersionId) throw new Error('Page or page version is required.')
  if (!targetSectionId) throw new Error('Section is required.')

  await loadSection(scopeId, targetSectionId)

  const sourcePageVersion =
    sourcePageVersionId
      ? await loadPageVersion(scopeId, sourcePageVersionId)
      : pickLatestPageVersion(await listPageVersions(scopeId, sourcePageId))
  if (!sourcePageVersion) throw new Error('Page version could not be resolved.')

  const resolvedSourcePageVersionId = normalizeNonEmpty(sourcePageVersion.id)
  const resolvedSourcePageId = normalizeNonEmpty(sourcePageVersion.pageId) || sourcePageId
  if (!resolvedSourcePageVersionId) throw new Error('Page version could not be resolved.')
  if (!resolvedSourcePageId) throw new Error('Page could not be resolved.')

  let targetPageVersionId = resolvedSourcePageVersionId
  let clonedPage: Record<string, unknown> | undefined
  let clonedPageVersion: Record<string, unknown> | undefined
  if (clonePage) {
    const cloned = await createClonedPageWithVersion({
      scopeId,
      sourcePageId: resolvedSourcePageId,
      sourcePageVersion,
      rename,
    })
    targetPageVersionId = cloned.pageVersionId
    clonedPage = cloned.page
    clonedPageVersion = cloned.pageVersion
  }

  const links = await listSectionPageLinks(scopeId, targetSectionId)
  if (links.some((entry) => entry.pageVersionId === targetPageVersionId)) {
    throw new Error('Page version is already linked in section.')
  }
  const position = resolvePosition(input.position, getNextPosition(links))
  const linkResult = await runDocmanOperation('section-page-link.create', {
    scopeId,
    data: {
      sectionId: targetSectionId,
      pageVersionId: targetPageVersionId,
      position,
      depth: 0,
      titleOverride: !clonePage && rename ? rename : undefined,
    },
  })
  const linkId = extractId(linkResult, ['sectionPageLinkId', 'linkId'])

  return {
    action: 'copy-page' as const,
    mode: clonePage ? 'clone-page' as const : 'reuse-page' as const,
    sourcePageId: resolvedSourcePageId,
    sourcePageVersionId: resolvedSourcePageVersionId,
    targetSectionId,
    pageId: clonePage ? normalizeNonEmpty(clonedPage?.id) : resolvedSourcePageId,
    pageVersionId: targetPageVersionId,
    page: clonedPage,
    pageVersion: clonedPageVersion ?? sourcePageVersion,
    link: {
      id: linkId,
      sectionId: targetSectionId,
      pageVersionId: targetPageVersionId,
      parentLinkId: '',
      position,
      depth: 0,
      titleOverride: !clonePage ? rename : '',
      numbering: '',
    },
    focusPageVersionId: targetPageVersionId,
  }
}

export async function createDocmanPageWithInitialVersionFlow(input: CreateDocmanPageWithInitialVersionFlowInput) {
  const scopeId = normalizeNonEmpty(input.scopeId)
  const payload = toRecord(input.data)
  const pageFormat = resolveDocmanPageSourceFormat(payload.format)
  const pagePayload = stripPageVersionSeedFields(payload)

  if (!scopeId) throw new Error('Scope is required.')

  const pageResult = await runDocmanOperation('page.create', {
    scopeId,
    data: pagePayload,
  })
  const pageId = extractId(pageResult, ['pageId'])
  if (!pageId) {
    throw new Error('Page was created but could not be resolved.')
  }

  const pageTitle = normalizeNonEmpty(payload.title) || normalizeNonEmpty(toRecord(pageResult).title)
  let pageVersionId = ''
  let pageVersionError = ''
  let createdPageVersionRecord: Record<string, unknown> = {}

  try {
    const pageVersionResult = await runDocmanOperation('page-version.create', {
      scopeId,
      data: {
        pageId,
        version: 1,
        status: 'draft',
        title: pageTitle || undefined,
        format: pageFormat,
        content: '',
      },
    })
    createdPageVersionRecord = toRecord(toItem<Record<string, unknown>>(pageVersionResult))
    pageVersionId = extractId(pageVersionResult, ['pageVersionId'])
    if (!pageVersionId) {
      const versions = await listPageVersions(scopeId, pageId)
      const createdVersion =
        versions.find((version) => normalizeNonEmpty(version.id) && Number(version.version) === 1) ??
        versions.find((version) => normalizeNonEmpty(version.id))
      pageVersionId = normalizeNonEmpty(createdVersion?.id)
      createdPageVersionRecord = createdVersion ?? createdPageVersionRecord
    }
    if (!pageVersionId) {
      pageVersionError = 'Failed to create initial page version.'
    }
  } catch (error) {
    pageVersionError =
      error instanceof Error && error.message.trim().length > 0
      ? error.message
        : 'Failed to create initial page version.'
  }

  const pageVersion =
    pageVersionId
      ? {
          pageId,
          version: 1,
          status: 'draft',
          title: pageTitle,
          format: pageFormat,
          content: '',
          ...createdPageVersionRecord,
          id: pageVersionId,
        }
      : null

  return {
    action: 'create-page-with-initial-version' as const,
    pageId,
    page: {
      id: pageId,
      pageUid: normalizeNonEmpty(toRecord(pageResult).pageUid) || normalizeNonEmpty(payload.pageUid),
      title: normalizeNonEmpty(toRecord(pageResult).title) || pageTitle,
      kind:
        normalizeNonEmpty(toRecord(pageResult).kind) || normalizeNonEmpty(pagePayload.kind) || 'content',
    },
    pageVersionId,
    pageVersion,
    focusPageVersionId: pageVersionId,
    pageVersionError,
    hasPageVersion: Boolean(pageVersionId),
  }
}

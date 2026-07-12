import { z } from 'zod'

import {
  buildToolInputEnvelopeSchema,
  buildToolInputSchema,
  optionalToolInputNumber,
  optionalToolInputString,
  type FlattenToolingEnvelopeInput,
  parseToolInputWithZod,
  requiredToolInputString,
  type ParseToolInputWithZodOptions,
  type ToolOperationArg,
} from '../shared/tool-input-guard.js'
import {
  documentGroupZodSchemaInsert,
  documentSectionLinkZodSchemaInsert,
  documentVersionZodSchemaInsert,
  documentZodSchemaInsert,
  assetVersionMutablePatchZodSchema,
  assetVersionZodSchemaInsert,
  assetZodSchemaInsert,
  embedZodSchemaInsert,
  pageEmbedLinkZodSchemaInsert,
  pageSnippetLinkZodSchemaInsert,
  pageVersionZodSchemaInsert,
  pageZodSchemaInsert,
  sectionPageLinkZodSchemaInsert,
  sectionZodSchemaInsert,
  snippetZodSchemaInsert,
} from '@aopslab/domain-dm-docman/models'

import { listDocmanOperationSpecs } from './catalog.js'
import type { DocmanOperationInput, DocmanTypedOperationId } from './io-types.js'
import { isDocmanScopeOwnedCreateOperation } from './scope-owned-create.js'

export type DocmanToolInput<TId extends DocmanTypedOperationId> = FlattenToolingEnvelopeInput<DocmanOperationInput<TId>>

type DocmanToolInputParseOptions = Omit<
  ParseToolInputWithZodOptions,
  'operationId' | 'input' | 'args' | 'schema'
> & {
  args?: ReadonlyArray<ToolOperationArg>
}

const DOCMAN_OPERATION_ARGS_BY_ID = new Map(
  listDocmanOperationSpecs({ refresh: true }).map((operation) => [
    operation.operationId as DocmanTypedOperationId,
    operation.args,
  ] satisfies readonly [DocmanTypedOperationId, ReadonlyArray<ToolOperationArg>]),
)

const DOCMAN_OPTIONS_SCHEMA = z.record(z.string(), z.unknown())
const DOCMAN_LOCALE_OPTIONS_SCHEMA = z
  .object({
    locale: optionalToolInputString('locale'),
    fallbackLocale: optionalToolInputString('fallbackLocale'),
  })
  .strict()

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function normalizeNonEmpty(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeScopeResolution(input: unknown): 'explicit' | 'cascade' | undefined {
  return input === 'explicit' || input === 'cascade' ? input : undefined
}

function buildCrudListInputSchema() {
  return buildToolInputSchema({
    filter: z.record(z.string(), z.unknown()).optional(),
    options: DOCMAN_OPTIONS_SCHEMA.optional(),
  })
}

function buildCrudGetInputSchema() {
  return buildToolInputSchema({
    id: requiredToolInputString('id'),
    options: DOCMAN_OPTIONS_SCHEMA.optional(),
  })
}

function buildCrudDeleteInputSchema() {
  return buildToolInputSchema({
    id: requiredToolInputString('id'),
  })
}

function buildCrudCreateInputSchema(inner: z.ZodObject<z.ZodRawShape>) {
  return buildToolInputEnvelopeSchema({
    envelopeKey: 'data',
    inner,
  })
}

function buildCrudUpdateInputSchema(inner: z.ZodObject<z.ZodRawShape>, operationId: string) {
  return buildToolInputEnvelopeSchema({
    envelopeKey: 'patch',
    extraShape: {
      id: requiredToolInputString('id'),
    },
    inner: z.object(inner.shape).partial().strict(),
  }).superRefine((value, ctx) => {
    const payload = toRecord(value)
    const patch = toRecord(payload.patch)
    if (Object.keys(patch).length > 0) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `validation_failed:${operationId}`,
      path: ['patch'],
    })
  })
}

function parseCrudKind(operationId: string): 'list' | 'get' | 'create' | 'update' | 'delete' | null {
  const segments = operationId
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (segments.length !== 2) return null
  const kind = segments[1]
  if (kind === 'list' || kind === 'get' || kind === 'create' || kind === 'update' || kind === 'delete') {
    return kind
  }
  return null
}

function normalizeDocmanScopeAwareInput(operationId: string, input: unknown): unknown {
  const payload = toRecord(input)
  if (Object.keys(payload).length === 0) return input

  if (operationId === 'document.scope.search') {
    return Object.fromEntries(
      Object.entries(payload).filter(([key]) => !['scopeResolution', '__hostContext'].includes(key)),
    )
  }

  if (operationId === 'document-version.import-headings') {
    return payload
  }

  const kind = parseCrudKind(operationId)
  if (kind === 'list') {
    const hasFilterEnvelope = Object.prototype.hasOwnProperty.call(payload, 'filter')
    const filter = hasFilterEnvelope
      ? { ...toRecord(payload.filter) }
      : Object.fromEntries(
          Object.entries(payload).filter(([key]) => !['filter', 'options', 'scopeId', 'scopeResolution'].includes(key)),
        )
    const scopeId = normalizeNonEmpty(payload.scopeId)
    const scopeResolution = normalizeScopeResolution(payload.scopeResolution)
    if (scopeId && filter.scopeId === undefined) {
      filter.scopeId = scopeId
    }
    if (scopeResolution && filter.scopeResolution === undefined) {
      filter.scopeResolution = scopeResolution
    }
    const options = toRecord(payload.options)
    return {
      ...(Object.keys(filter).length > 0 ? { filter } : {}),
      ...(Object.keys(options).length > 0 ? { options } : {}),
    }
  }

  if (kind === 'create') {
    const scopeId = normalizeNonEmpty(payload.scopeId)
    const hasDataEnvelope = Object.prototype.hasOwnProperty.call(payload, 'data')
    const data = hasDataEnvelope ? { ...toRecord(payload.data) } : { ...payload }
    delete data.scopeId
    delete data.scopeResolution
    if (scopeId && isDocmanScopeOwnedCreateOperation(operationId)) {
      data.scopeId = scopeId
    }
    return { data }
  }

  if (kind === 'get') {
    const id = normalizeNonEmpty(payload.id)
    const options = toRecord(payload.options)
    return {
      ...(id ? { id } : {}),
      ...(Object.keys(options).length > 0 ? { options } : {}),
    }
  }

  if (kind === 'update') {
    const id = normalizeNonEmpty(payload.id)
    const hasPatchEnvelope = Object.prototype.hasOwnProperty.call(payload, 'patch')
    const patch = hasPatchEnvelope
      ? { ...toRecord(payload.patch) }
      : Object.fromEntries(
          Object.entries(payload).filter(([key]) => !['id', 'patch', 'scopeId', 'scopeResolution'].includes(key)),
        )
    delete patch.scopeId
    delete patch.scopeResolution
    return {
      ...(id ? { id } : {}),
      ...(Object.keys(patch).length > 0 ? { patch } : {}),
    }
  }

  if (kind === 'delete') {
    const id = normalizeNonEmpty(payload.id)
    return id ? { id } : input
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !['scopeId', 'scopeResolution', '__hostContext'].includes(key)),
  )
}

const docmanComposeIndexInputSchema = buildToolInputSchema({
  documentVersionId: requiredToolInputString('documentVersionId'),
  options: DOCMAN_LOCALE_OPTIONS_SCHEMA.optional(),
})

const docmanDocumentIndexInputSchema = buildToolInputSchema({
  documentVersionId: requiredToolInputString('documentVersionId'),
  locale: optionalToolInputString('locale'),
  fallbackLocale: optionalToolInputString('fallbackLocale'),
})

const docmanDocumentSearchInputSchema = buildToolInputSchema({
  documentVersionId: requiredToolInputString('documentVersionId'),
  q: requiredToolInputString('q'),
  limit: optionalToolInputNumber('limit'),
  retrievalStrategy: z.enum(['lexical', 'hybrid', 'semantic']).optional(),
  locale: optionalToolInputString('locale'),
  fallbackLocale: optionalToolInputString('fallbackLocale'),
})

const docmanScopeDocumentSearchInputSchema = buildToolInputSchema({
  scopeId: requiredToolInputString('scopeId'),
  q: requiredToolInputString('q'),
  limit: optionalToolInputNumber('limit'),
  retrievalStrategy: z.enum(['lexical', 'hybrid', 'semantic']).optional(),
  locale: optionalToolInputString('locale'),
  fallbackLocale: optionalToolInputString('fallbackLocale'),
})

const docmanComposeFetchInputSchema = buildToolInputSchema({
  documentVersionId: requiredToolInputString('documentVersionId'),
  sectionId: optionalToolInputString('sectionId'),
  pageVersionId: optionalToolInputString('pageVersionId'),
  pageNumber: optionalToolInputNumber('pageNumber'),
  locale: optionalToolInputString('locale'),
  fallbackLocale: optionalToolInputString('fallbackLocale'),
})

const docmanPublishMaterializeInputSchema = buildToolInputSchema({
  documentVersionId: requiredToolInputString('documentVersionId'),
  target: z.enum(['markdown', 'html']),
  sectionId: optionalToolInputString('sectionId'),
  pageVersionId: optionalToolInputString('pageVersionId'),
  pageNumber: optionalToolInputNumber('pageNumber'),
  locale: optionalToolInputString('locale'),
  fallbackLocale: optionalToolInputString('fallbackLocale'),
})

const docmanSectionUsageListInputSchema = buildToolInputSchema({
  sectionId: requiredToolInputString('sectionId'),
})

const docmanDeleteSafeInputSchema = buildToolInputSchema({
  id: requiredToolInputString('id'),
  confirmName: requiredToolInputString('confirmName'),
})

const docmanParsedHeadingGraphNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      kind: z.enum(['section', 'page']),
      title: requiredToolInputString('title'),
      depth: optionalToolInputNumber('depth'),
      slug: optionalToolInputString('slug'),
      bodyMarkdown: z.string().optional(),
      children: z.array(docmanParsedHeadingGraphNodeSchema).optional(),
    })
    .strict(),
)

const docmanDocumentVersionSetCurrentInputSchema = buildToolInputSchema({
  documentVersionId: requiredToolInputString('documentVersionId'),
  documentId: optionalToolInputString('documentId'),
  publish: z.boolean().optional(),
  publishedAt: z
    .union([
      z.date(),
      z
        .string()
        .datetime()
        .transform((value) => new Date(value)),
    ])
    .optional(),
  expectedPreviousVersionId: optionalToolInputString('expectedPreviousVersionId'),
})

const docmanDocumentVersionImportHeadingsInputSchema = buildToolInputSchema({
  documentVersionId: requiredToolInputString('documentVersionId'),
  scopeId: optionalToolInputString('scopeId'),
  parsedGraph: z
    .object({
      sourceHash: optionalToolInputString('sourceHash'),
      sourcePath: optionalToolInputString('sourcePath'),
      nodes: z.array(docmanParsedHeadingGraphNodeSchema),
    })
    .strict(),
  options: z
    .object({
      dryRun: z.boolean().optional(),
      existingGraphPolicy: z.enum(['error', 'append', 'replace']).optional(),
      slugStrategy: z.enum(['hash-suffix-on-collision', 'kebab-from-title']).optional(),
      bodyAssignment: z.literal('leaf-page-content').optional(),
      headingToPagePolicy: z.literal('h4-and-below').optional(),
      synthesizeOverviewPages: z.boolean().optional(),
    })
    .strict()
    .optional(),
  createdBy: optionalToolInputString('createdBy'),
  updatedBy: optionalToolInputString('updatedBy'),
})

const DOCMAN_OPERATION_INPUT_SCHEMA_BY_ID = new Map(
  [
    ['document.list', buildCrudListInputSchema()],
    ['document.get', buildCrudGetInputSchema()],
    ['document.create', buildCrudCreateInputSchema(documentZodSchemaInsert)],
    ['document.update', buildCrudUpdateInputSchema(documentZodSchemaInsert, 'document.update')],
    ['document.delete', buildCrudDeleteInputSchema()],
    ['document-group.list', buildCrudListInputSchema()],
    ['document-group.get', buildCrudGetInputSchema()],
    ['document-group.create', buildCrudCreateInputSchema(documentGroupZodSchemaInsert)],
    ['document-group.update', buildCrudUpdateInputSchema(documentGroupZodSchemaInsert, 'document-group.update')],
    ['document-group.delete', buildCrudDeleteInputSchema()],
    ['document-version.list', buildCrudListInputSchema()],
    ['document-version.get', buildCrudGetInputSchema()],
    ['document-version.create', buildCrudCreateInputSchema(documentVersionZodSchemaInsert)],
    ['document-version.update', buildCrudUpdateInputSchema(documentVersionZodSchemaInsert, 'document-version.update')],
    ['document-version.delete', buildCrudDeleteInputSchema()],
    ['section.list', buildCrudListInputSchema()],
    ['section.get', buildCrudGetInputSchema()],
    ['section.create', buildCrudCreateInputSchema(sectionZodSchemaInsert)],
    ['section.update', buildCrudUpdateInputSchema(sectionZodSchemaInsert, 'section.update')],
    ['section.delete', buildCrudDeleteInputSchema()],
    ['page.list', buildCrudListInputSchema()],
    ['page.get', buildCrudGetInputSchema()],
    ['page.create', buildCrudCreateInputSchema(pageZodSchemaInsert)],
    ['page.update', buildCrudUpdateInputSchema(pageZodSchemaInsert, 'page.update')],
    ['page.delete', buildCrudDeleteInputSchema()],
    ['page-version.list', buildCrudListInputSchema()],
    ['page-version.get', buildCrudGetInputSchema()],
    ['page-version.create', buildCrudCreateInputSchema(pageVersionZodSchemaInsert)],
    ['page-version.update', buildCrudUpdateInputSchema(pageVersionZodSchemaInsert, 'page-version.update')],
    ['page-version.delete', buildCrudDeleteInputSchema()],
    ['document-section-link.list', buildCrudListInputSchema()],
    ['document-section-link.get', buildCrudGetInputSchema()],
    ['document-section-link.create', buildCrudCreateInputSchema(documentSectionLinkZodSchemaInsert)],
    ['document-section-link.update', buildCrudUpdateInputSchema(documentSectionLinkZodSchemaInsert, 'document-section-link.update')],
    ['document-section-link.delete', buildCrudDeleteInputSchema()],
    ['section-page-link.list', buildCrudListInputSchema()],
    ['section-page-link.get', buildCrudGetInputSchema()],
    ['section-page-link.create', buildCrudCreateInputSchema(sectionPageLinkZodSchemaInsert)],
    ['section-page-link.update', buildCrudUpdateInputSchema(sectionPageLinkZodSchemaInsert, 'section-page-link.update')],
    ['section-page-link.delete', buildCrudDeleteInputSchema()],
    ['snippet.list', buildCrudListInputSchema()],
    ['snippet.get', buildCrudGetInputSchema()],
    ['snippet.create', buildCrudCreateInputSchema(snippetZodSchemaInsert)],
    ['snippet.update', buildCrudUpdateInputSchema(snippetZodSchemaInsert, 'snippet.update')],
    ['snippet.delete', buildCrudDeleteInputSchema()],
    ['page-snippet-link.list', buildCrudListInputSchema()],
    ['page-snippet-link.get', buildCrudGetInputSchema()],
    ['page-snippet-link.create', buildCrudCreateInputSchema(pageSnippetLinkZodSchemaInsert)],
    ['page-snippet-link.update', buildCrudUpdateInputSchema(pageSnippetLinkZodSchemaInsert, 'page-snippet-link.update')],
    ['page-snippet-link.delete', buildCrudDeleteInputSchema()],
    ['asset.list', buildCrudListInputSchema()],
    ['asset.get', buildCrudGetInputSchema()],
    ['asset.create', buildCrudCreateInputSchema(assetZodSchemaInsert)],
    ['asset.update', buildCrudUpdateInputSchema(assetZodSchemaInsert, 'asset.update')],
    ['asset.delete', buildCrudDeleteInputSchema()],
    ['asset-version.list', buildCrudListInputSchema()],
    ['asset-version.get', buildCrudGetInputSchema()],
    ['asset-version.create', buildCrudCreateInputSchema(assetVersionZodSchemaInsert)],
    ['asset-version.update', buildCrudUpdateInputSchema(assetVersionMutablePatchZodSchema, 'asset-version.update')],
    ['asset-version.delete', buildCrudDeleteInputSchema()],
    ['embed.list', buildCrudListInputSchema()],
    ['embed.get', buildCrudGetInputSchema()],
    ['embed.create', buildCrudCreateInputSchema(embedZodSchemaInsert)],
    ['embed.update', buildCrudUpdateInputSchema(embedZodSchemaInsert, 'embed.update')],
    ['embed.delete', buildCrudDeleteInputSchema()],
    ['page-embed-link.list', buildCrudListInputSchema()],
    ['page-embed-link.get', buildCrudGetInputSchema()],
    ['page-embed-link.create', buildCrudCreateInputSchema(pageEmbedLinkZodSchemaInsert)],
    ['page-embed-link.update', buildCrudUpdateInputSchema(pageEmbedLinkZodSchemaInsert, 'page-embed-link.update')],
    ['page-embed-link.delete', buildCrudDeleteInputSchema()],
    ['document.compose.index', docmanComposeIndexInputSchema],
    ['document.index.build', docmanDocumentIndexInputSchema],
    ['document.index.get', docmanDocumentIndexInputSchema],
    ['document.summary.build', docmanDocumentIndexInputSchema],
    ['document.summary.get', docmanDocumentIndexInputSchema],
    ['document.search', docmanDocumentSearchInputSchema],
    ['document.scope.search', docmanScopeDocumentSearchInputSchema],
    ['document.answer-pack', docmanDocumentSearchInputSchema],
    ['document.compose.fetch', docmanComposeFetchInputSchema],
    ['document.publish.materialize', docmanPublishMaterializeInputSchema],
    ['document.delete.safe', docmanDeleteSafeInputSchema],
    ['document-version.delete.safe', buildToolInputSchema({ id: requiredToolInputString('id') })],
    ['document-version.import-headings', docmanDocumentVersionImportHeadingsInputSchema],
    ['document-version.set-current', docmanDocumentVersionSetCurrentInputSchema],
    ['document-section-link.usage.list', docmanSectionUsageListInputSchema],
  ] satisfies ReadonlyArray<readonly [DocmanTypedOperationId, z.ZodTypeAny]>,
)

export function getDocmanOperationArgs<TId extends DocmanTypedOperationId>(
  operationId: TId,
): ReadonlyArray<ToolOperationArg> {
  return DOCMAN_OPERATION_ARGS_BY_ID.get(operationId) ?? []
}

export function getDocmanToolInputSchema<TId extends DocmanTypedOperationId>(
  operationId: TId,
): z.ZodType<DocmanOperationInput<TId>> | undefined {
  return DOCMAN_OPERATION_INPUT_SCHEMA_BY_ID.get(operationId) as z.ZodType<DocmanOperationInput<TId>> | undefined
}

export function parseDocmanToolInput<TId extends DocmanTypedOperationId>(
  operationId: TId,
  input: DocmanToolInput<TId> | DocmanOperationInput<TId> | unknown,
  options: DocmanToolInputParseOptions = {},
): DocmanOperationInput<TId> {
  const schema = getDocmanToolInputSchema(operationId)
  if (!schema) {
    throw new Error(`unknown_docman_operation:${operationId}`)
  }

  return parseToolInputWithZod<DocmanOperationInput<TId>>({
    ...options,
    operationId,
    input: normalizeDocmanScopeAwareInput(operationId, input),
    args: options.args ?? getDocmanOperationArgs(operationId),
    schema,
  })
}

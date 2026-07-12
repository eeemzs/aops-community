import type { DocmanOperationArgument, DocmanOperationKind, DocmanOperationSpec } from './types.js'
import {
  cloneDocmanOperationSpec,
  defineDocmanKitOperation,
  defineDocmanKitOperations,
  normalizeDocmanOperationId,
} from './definition.js'
import { createDocmanSchemaRef, getDocmanOperationIoSchemaRefs } from './schemas.js'

type CrudEntityDefinition = {
  entity: string
  serviceKey: string
  serviceEntityPascal: string
}

type CustomOperationDefinition = {
  operationId: string
  serviceKey: string
  serviceEntity: string
  methodName: string
  args: DocmanOperationArgument[]
}

const CRUD_LIST_ARGS: DocmanOperationArgument[] = [
  { name: 'filter', optional: true },
  { name: 'options', optional: true },
]

const CRUD_GET_ARGS: DocmanOperationArgument[] = [
  { name: 'id', optional: false },
  { name: 'options', optional: true },
]

const CRUD_CREATE_ARGS: DocmanOperationArgument[] = [{ name: 'data', optional: false }]

const CRUD_UPDATE_ARGS: DocmanOperationArgument[] = [
  { name: 'id', optional: false },
  { name: 'patch', optional: false },
]

const CRUD_DELETE_ARGS: DocmanOperationArgument[] = [{ name: 'id', optional: false }]

const CRUD_ENTITIES: CrudEntityDefinition[] = [
  { entity: 'document', serviceKey: 'documentService', serviceEntityPascal: 'Document' },
  { entity: 'document-group', serviceKey: 'documentGroupService', serviceEntityPascal: 'DocumentGroup' },
  { entity: 'document-version', serviceKey: 'documentVersionService', serviceEntityPascal: 'DocumentVersion' },
  { entity: 'section', serviceKey: 'sectionService', serviceEntityPascal: 'Section' },
  { entity: 'page', serviceKey: 'pageService', serviceEntityPascal: 'Page' },
  { entity: 'page-version', serviceKey: 'pageVersionService', serviceEntityPascal: 'PageVersion' },
  { entity: 'document-section-link', serviceKey: 'documentSectionLinkService', serviceEntityPascal: 'DocumentSectionLink' },
  { entity: 'section-page-link', serviceKey: 'sectionPageLinkService', serviceEntityPascal: 'SectionPageLink' },
  { entity: 'snippet', serviceKey: 'snippetService', serviceEntityPascal: 'Snippet' },
  { entity: 'page-snippet-link', serviceKey: 'pageSnippetLinkService', serviceEntityPascal: 'PageSnippetLink' },
  { entity: 'asset', serviceKey: 'assetService', serviceEntityPascal: 'Asset' },
  { entity: 'asset-version', serviceKey: 'assetVersionService', serviceEntityPascal: 'AssetVersion' },
  { entity: 'embed', serviceKey: 'embedService', serviceEntityPascal: 'Embed' },
  { entity: 'page-embed-link', serviceKey: 'pageEmbedLinkService', serviceEntityPascal: 'PageEmbedLink' },
]

const CUSTOM_OPERATIONS: CustomOperationDefinition[] = [
  {
    operationId: 'document.delete.safe',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'removeDocumentSafe',
    args: [
      { name: 'id', optional: false },
      { name: 'confirmName', optional: false },
    ],
  },
  {
    operationId: 'document-version.delete.safe',
    serviceKey: 'documentVersionService',
    serviceEntity: 'document-version',
    methodName: 'removeDocumentVersionSafe',
    args: [{ name: 'id', optional: false }],
  },
  {
    operationId: 'document-version.import-headings',
    serviceKey: 'documentVersionService',
    serviceEntity: 'document-version',
    methodName: 'importHeadings',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'scopeId', optional: true },
      { name: 'parsedGraph', optional: false },
      { name: 'options', optional: true },
      { name: 'createdBy', optional: true },
      { name: 'updatedBy', optional: true },
    ],
  },
  {
    operationId: 'document-version.set-current',
    serviceKey: 'documentVersionService',
    serviceEntity: 'document-version',
    methodName: 'setCurrent',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'documentId', optional: true },
      { name: 'publish', optional: true },
      { name: 'publishedAt', optional: true },
      { name: 'expectedPreviousVersionId', optional: true },
    ],
  },
  {
    operationId: 'document.compose.index',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'buildDocumentIndex',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'options', optional: true },
    ],
  },
  {
    operationId: 'document.index.build',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'buildPersistedDocumentIndex',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document.index.get',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'getPersistedDocumentIndex',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document.summary.build',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'buildPersistedDocumentSummary',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document.summary.get',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'getPersistedDocumentSummary',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document.search',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'searchPersistedDocumentIndex',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'q', optional: false },
      { name: 'limit', optional: true },
      { name: 'retrievalStrategy', optional: true },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document.scope.search',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'searchScopePersistedDocumentIndex',
    args: [
      { name: 'scopeId', optional: false },
      { name: 'q', optional: false },
      { name: 'limit', optional: true },
      { name: 'retrievalStrategy', optional: true },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document.answer-pack',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'getDocumentAnswerPack',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'q', optional: false },
      { name: 'limit', optional: true },
      { name: 'retrievalStrategy', optional: true },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document.compose.fetch',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'fetchComposedFragment',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'sectionId', optional: true },
      { name: 'pageVersionId', optional: true },
      { name: 'pageNumber', optional: true },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document.publish.materialize',
    serviceKey: 'documentService',
    serviceEntity: 'document',
    methodName: 'materializePublishedFragment',
    args: [
      { name: 'documentVersionId', optional: false },
      { name: 'target', optional: false },
      { name: 'sectionId', optional: true },
      { name: 'pageVersionId', optional: true },
      { name: 'pageNumber', optional: true },
      { name: 'locale', optional: true },
      { name: 'fallbackLocale', optional: true },
    ],
  },
  {
    operationId: 'document-section-link.usage.list',
    serviceKey: 'documentSectionLinkService',
    serviceEntity: 'document-section-link',
    methodName: 'listDocumentSectionLinkUsageBySectionId',
    args: [{ name: 'sectionId', optional: false }],
  },
]

let cachedOperations: DocmanOperationSpec[] | null = null

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function buildCrudMethodName(serviceEntityPascal: string, kind: Exclude<DocmanOperationKind, 'custom'>): string {
  if (kind === 'list') return `list${serviceEntityPascal}s`
  if (kind === 'get') return 'getById'
  if (kind === 'create') return 'create'
  if (kind === 'update') return `update${serviceEntityPascal}`
  return `remove${serviceEntityPascal}`
}

function buildCrudOperation(
  entity: CrudEntityDefinition,
  kind: Exclude<DocmanOperationKind, 'custom'>,
  args: DocmanOperationArgument[],
): DocmanOperationSpec {
  const operationId = `${entity.entity}.${kind}`
  return defineDocmanKitOperation({
    operationId,
    serviceKey: entity.serviceKey,
    serviceEntity: entity.entity,
    methodName: buildCrudMethodName(entity.serviceEntityPascal, kind),
    kind,
    args,
    ...toOperationSchemaRefs(operationId),
  })
}

function buildCrudOperations(): DocmanOperationSpec[] {
  const operations: DocmanOperationSpec[] = []
  for (const entity of CRUD_ENTITIES) {
    operations.push(buildCrudOperation(entity, 'list', CRUD_LIST_ARGS))
    operations.push(buildCrudOperation(entity, 'get', CRUD_GET_ARGS))
    operations.push(buildCrudOperation(entity, 'create', CRUD_CREATE_ARGS))
    operations.push(buildCrudOperation(entity, 'update', CRUD_UPDATE_ARGS))
    operations.push(buildCrudOperation(entity, 'delete', CRUD_DELETE_ARGS))
  }
  return operations
}

function buildCustomOperations(): DocmanOperationSpec[] {
  return defineDocmanKitOperations(
    CUSTOM_OPERATIONS.map((operation) => ({
      operationId: operation.operationId,
      serviceKey: operation.serviceKey,
      serviceEntity: operation.serviceEntity,
      methodName: operation.methodName,
      kind: 'custom',
      args: operation.args,
      ...toOperationSchemaRefs(operation.operationId),
    })),
  )
}

function toOperationSchemaRefs(operationId: string): {
  inputSchema?: { $ref: string }
  outputSchema?: { $ref: string }
} {
  const refs = getDocmanOperationIoSchemaRefs(normalizeDocmanOperationId(operationId))
  if (!refs) return {}
  return {
    inputSchema: createDocmanSchemaRef(refs.inputRef),
    outputSchema: createDocmanSchemaRef(refs.outputRef),
  }
}

function buildOperationsInternal(): DocmanOperationSpec[] {
  const operations = [
    ...buildCrudOperations(),
    ...buildCustomOperations(),
  ]

  const unique = new Map<string, DocmanOperationSpec>()
  for (const operation of operations) {
    unique.set(operation.operationId, operation)
  }

  return [...unique.values()].sort((left, right) => left.operationId.localeCompare(right.operationId))
}

export function listDocmanOperationSpecs(options?: { refresh?: boolean }): DocmanOperationSpec[] {
  const opts = toRecord(options)
  const refresh = opts.refresh === true
  if (!cachedOperations || refresh) {
    cachedOperations = buildOperationsInternal()
  }
  return cachedOperations.map(cloneDocmanOperationSpec)
}

export function getDocmanOperationByToolId(toolId: string, options?: { refresh?: boolean }): DocmanOperationSpec | null {
  const operations = listDocmanOperationSpecs(options)
  return operations.find((operation) => operation.toolId === toolId) ?? null
}

export function getDocmanOperationById(operationId: string, options?: { refresh?: boolean }): DocmanOperationSpec | null {
  const normalized = normalizeDocmanOperationId(operationId)
  const operations = listDocmanOperationSpecs(options)
  return operations.find((operation) => operation.operationId === normalized) ?? null
}

export { buildDocmanToolIdFromOperation } from './definition.js'

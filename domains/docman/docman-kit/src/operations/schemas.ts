import type { DocmanOperationKind, DocmanOperationSchemaRef } from './types.js'
import { normalizeDocmanOperationId } from './definition.js'

type JsonSchema = Record<string, unknown>
type SchemaDirection = 'input' | 'output'

const CRUD_KINDS = new Set<Exclude<DocmanOperationKind, 'custom'>>(['list', 'get', 'create', 'update', 'delete'])

const GENERIC_LIST_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filter: { type: 'object', additionalProperties: true },
    options: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_GET_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
    options: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_CREATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_UPDATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'patch'],
  properties: {
    id: { type: 'string', minLength: 1 },
    patch: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_DELETE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
}

const GENERIC_LIST_OUTPUT_SCHEMA: JsonSchema = {
  type: 'array',
  items: { type: 'object', additionalProperties: true },
}

const GENERIC_GET_OUTPUT_SCHEMA: JsonSchema = {
  anyOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }],
}

const GENERIC_OBJECT_OUTPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
}

const GENERIC_VOID_OUTPUT_SCHEMA: JsonSchema = {
  anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: true }],
}

const GENERIC_CUSTOM_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
}

const GENERIC_CUSTOM_OUTPUT_SCHEMA: JsonSchema = {}

const DOCMAN_OPERATION_SCHEMA_REFS = {
  documentListInput: 'document.list.input',
  documentListOutput: 'document.list.output',
  documentGetInput: 'document.get.input',
  documentGetOutput: 'document.get.output',
  documentCreateInput: 'document.create.input',
  documentCreateOutput: 'document.create.output',
  documentUpdateInput: 'document.update.input',
  documentUpdateOutput: 'document.update.output',
  documentComposeIndexInput: 'document.compose.index.input',
  documentComposeIndexOutput: 'document.compose.index.output',
  documentIndexBuildInput: 'document.index.build.input',
  documentIndexBuildOutput: 'document.index.build.output',
  documentIndexGetInput: 'document.index.get.input',
  documentIndexGetOutput: 'document.index.get.output',
  documentSummaryBuildInput: 'document.summary.build.input',
  documentSummaryBuildOutput: 'document.summary.build.output',
  documentSummaryGetInput: 'document.summary.get.input',
  documentSummaryGetOutput: 'document.summary.get.output',
  documentSearchInput: 'document.search.input',
  documentSearchOutput: 'document.search.output',
  documentScopeSearchInput: 'document.scope.search.input',
  documentScopeSearchOutput: 'document.scope.search.output',
  documentAnswerPackInput: 'document.answer-pack.input',
  documentAnswerPackOutput: 'document.answer-pack.output',
  documentComposeFetchInput: 'document.compose.fetch.input',
  documentComposeFetchOutput: 'document.compose.fetch.output',
  documentPublishMaterializeInput: 'document.publish.materialize.input',
  documentPublishMaterializeOutput: 'document.publish.materialize.output',
} as const

const OPERATION_IO_SCHEMA_REF_OVERRIDES: Record<string, { inputRef: string; outputRef: string }> = {
  'document.list': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentListInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentListOutput,
  },
  'document.get': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentGetInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentGetOutput,
  },
  'document.create': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentCreateInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentCreateOutput,
  },
  'document.update': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentUpdateInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentUpdateOutput,
  },
  'document.compose.index': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentComposeIndexInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentComposeIndexOutput,
  },
  'document.index.build': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentIndexBuildInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentIndexBuildOutput,
  },
  'document.index.get': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentIndexGetInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentIndexGetOutput,
  },
  'document.summary.build': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryBuildInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryBuildOutput,
  },
  'document.summary.get': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryGetInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryGetOutput,
  },
  'document.search': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentSearchInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentSearchOutput,
  },
  'document.scope.search': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentScopeSearchInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentScopeSearchOutput,
  },
  'document.answer-pack': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentAnswerPackInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentAnswerPackOutput,
  },
  'document.compose.fetch': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentComposeFetchInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentComposeFetchOutput,
  },
  'document.publish.materialize': {
    inputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentPublishMaterializeInput,
    outputRef: DOCMAN_OPERATION_SCHEMA_REFS.documentPublishMaterializeOutput,
  },
}

const OVERRIDE_SCHEMAS_BY_REF: Record<string, JsonSchema> = {
  [DOCMAN_OPERATION_SCHEMA_REFS.documentListInput]: GENERIC_LIST_INPUT_SCHEMA,
  [DOCMAN_OPERATION_SCHEMA_REFS.documentListOutput]: GENERIC_LIST_OUTPUT_SCHEMA,
  [DOCMAN_OPERATION_SCHEMA_REFS.documentGetInput]: GENERIC_GET_INPUT_SCHEMA,
  [DOCMAN_OPERATION_SCHEMA_REFS.documentGetOutput]: GENERIC_GET_OUTPUT_SCHEMA,
  [DOCMAN_OPERATION_SCHEMA_REFS.documentCreateInput]: GENERIC_CREATE_INPUT_SCHEMA,
  [DOCMAN_OPERATION_SCHEMA_REFS.documentCreateOutput]: GENERIC_OBJECT_OUTPUT_SCHEMA,
  [DOCMAN_OPERATION_SCHEMA_REFS.documentUpdateInput]: GENERIC_UPDATE_INPUT_SCHEMA,
  [DOCMAN_OPERATION_SCHEMA_REFS.documentUpdateOutput]: GENERIC_OBJECT_OUTPUT_SCHEMA,
  [DOCMAN_OPERATION_SCHEMA_REFS.documentComposeIndexInput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId'],
    properties: {
      documentVersionId: { type: 'string', minLength: 1 },
      options: {
        type: 'object',
        additionalProperties: false,
        properties: {
          locale: { type: 'string' },
          fallbackLocale: { type: 'string' },
        },
      },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentComposeIndexOutput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'documentVersionId', 'title', 'items', 'pages'],
    properties: {
      documentId: { type: 'string' },
      documentVersionId: { type: 'string' },
      title: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            kind: { enum: ['section', 'page'] },
            format: { enum: ['md', 'mdx'] },
          },
        },
      },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            pageNumber: { type: 'number' },
            format: { enum: ['md', 'mdx'] },
            formats: { type: 'array', items: { enum: ['md', 'mdx'] } },
          },
        },
      },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentIndexBuildInput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId'],
    properties: {
      documentVersionId: { type: 'string', minLength: 1 },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentIndexBuildOutput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId', 'built', 'entries', 'counts'],
    properties: {
      documentId: { type: 'string' },
      documentVersionId: { type: 'string' },
      title: { type: 'string' },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
      built: { type: 'boolean' },
      buildFingerprint: { type: 'string' },
      documentAnchor: { type: 'string' },
      entries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['itemKind', 'anchor', 'depth', 'position', 'title', 'breadcrumb', 'titleVisible', 'pageBreakBefore', 'pageBreakAfter'],
          properties: {
            itemKind: { enum: ['section', 'page'] },
            linkId: { type: 'string' },
            parentLinkId: { type: 'string' },
            anchor: { type: 'string' },
            parentAnchor: { type: 'string' },
            number: { type: 'string' },
            depth: { type: 'number' },
            position: { type: 'number' },
            title: { type: 'string' },
            breadcrumb: { type: 'string' },
            titleVisible: { type: 'boolean' },
            pageBreakBefore: { type: 'boolean' },
            pageBreakAfter: { type: 'boolean' },
            sectionId: { type: 'string' },
            sectionUid: { type: 'string' },
            sectionSlug: { type: 'string' },
            pageId: { type: 'string' },
            pageUid: { type: 'string' },
            pageVersionId: { type: 'string' },
            format: { enum: ['md', 'mdx'] },
            pageNumberStart: { type: 'number' },
            pageNumberEnd: { type: 'number' },
          },
        },
      },
      counts: {
        type: 'object',
        additionalProperties: false,
        required: ['sections', 'pages'],
        properties: {
          sections: { type: 'number' },
          pages: { type: 'number' },
        },
      },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentIndexGetInput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId'],
    properties: {
      documentVersionId: { type: 'string', minLength: 1 },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentIndexGetOutput]: {
    $ref: DOCMAN_OPERATION_SCHEMA_REFS.documentIndexBuildOutput,
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryBuildInput]: {
    $ref: DOCMAN_OPERATION_SCHEMA_REFS.documentIndexBuildInput,
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryBuildOutput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId', 'built', 'entries', 'counts'],
    properties: {
      documentId: { type: 'string' },
      documentVersionId: { type: 'string' },
      title: { type: 'string' },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
      built: { type: 'boolean' },
      buildFingerprint: { type: 'string' },
      documentAnchor: { type: 'string' },
      entries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'itemKind',
            'anchor',
            'depth',
            'position',
            'title',
            'breadcrumb',
            'titleVisible',
            'pageBreakBefore',
            'pageBreakAfter',
            'summaryText',
            'sourceCharCount',
            'sourceWordCount',
            'summaryCharCount',
            'summaryWordCount',
          ],
          properties: {
            itemKind: { enum: ['document', 'section', 'page'] },
            linkId: { type: 'string' },
            parentLinkId: { type: 'string' },
            anchor: { type: 'string' },
            parentAnchor: { type: 'string' },
            number: { type: 'string' },
            depth: { type: 'number' },
            position: { type: 'number' },
            title: { type: 'string' },
            breadcrumb: { type: 'string' },
            titleVisible: { type: 'boolean' },
            pageBreakBefore: { type: 'boolean' },
            pageBreakAfter: { type: 'boolean' },
            sectionId: { type: 'string' },
            sectionUid: { type: 'string' },
            sectionSlug: { type: 'string' },
            pageId: { type: 'string' },
            pageUid: { type: 'string' },
            pageVersionId: { type: 'string' },
            format: { enum: ['md', 'mdx'] },
            pageNumberStart: { type: 'number' },
            pageNumberEnd: { type: 'number' },
            summaryText: { type: 'string' },
            sourceCharCount: { type: 'number' },
            sourceWordCount: { type: 'number' },
            summaryCharCount: { type: 'number' },
            summaryWordCount: { type: 'number' },
          },
        },
      },
      counts: {
        type: 'object',
        additionalProperties: false,
        required: ['documents', 'sections', 'pages'],
        properties: {
          documents: { type: 'number' },
          sections: { type: 'number' },
          pages: { type: 'number' },
        },
      },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryGetInput]: {
    $ref: DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryBuildInput,
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryGetOutput]: {
    $ref: DOCMAN_OPERATION_SCHEMA_REFS.documentSummaryBuildOutput,
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentSearchInput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId', 'q'],
    properties: {
      documentVersionId: { type: 'string', minLength: 1 },
      q: { type: 'string', minLength: 1 },
      limit: { type: 'number' },
      retrievalStrategy: { enum: ['lexical', 'hybrid', 'semantic'] },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentScopeSearchInput]: {
    type: 'object',
    additionalProperties: false,
    required: ['scopeId', 'q'],
    properties: {
      scopeId: { type: 'string', minLength: 1 },
      q: { type: 'string', minLength: 1 },
      limit: { type: 'number' },
      retrievalStrategy: { enum: ['lexical', 'hybrid', 'semantic'] },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentSearchOutput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId', 'q', 'built', 'hits', 'provenance'],
    properties: {
      documentVersionId: { type: 'string' },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
      q: { type: 'string' },
      built: { type: 'boolean' },
      buildFingerprint: { type: 'string' },
      hits: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'itemKind',
            'anchor',
            'depth',
            'title',
            'breadcrumb',
            'score',
            'excerpt',
            'matchedBy',
            'lexicalScore',
          ],
          properties: {
            itemKind: { enum: ['section', 'page'] },
            anchor: { type: 'string' },
            parentAnchor: { type: 'string' },
            number: { type: 'string' },
            depth: { type: 'number' },
            title: { type: 'string' },
            breadcrumb: { type: 'string' },
            sectionId: { type: 'string' },
            sectionUid: { type: 'string' },
            sectionSlug: { type: 'string' },
            pageId: { type: 'string' },
            pageUid: { type: 'string' },
            pageVersionId: { type: 'string' },
            format: { enum: ['md', 'mdx'] },
            pageNumberStart: { type: 'number' },
            pageNumberEnd: { type: 'number' },
            score: { type: 'number' },
            excerpt: { type: 'string' },
            matchedBy: {
              type: 'array',
              items: { enum: ['title', 'breadcrumb', 'number', 'bodyText', 'summaryText', 'semanticVector'] },
            },
            lexicalScore: { type: 'number' },
            semanticScore: { type: 'number' },
          },
        },
      },
      provenance: {
        type: 'object',
        additionalProperties: false,
        required: ['strategy', 'retrievalStrategy', 'vectorAvailable'],
        properties: {
          strategy: { enum: ['lexical-search-v1', 'hybrid-search-v1', 'semantic-search-v1'] },
          retrievalStrategy: { enum: ['lexical', 'hybrid', 'semantic'] },
          vectorAvailable: { type: 'boolean' },
          vectorProvider: { type: 'string' },
          vectorModel: { type: 'string' },
        },
      },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentScopeSearchOutput]: {
    type: 'object',
    additionalProperties: false,
    required: ['scopeId', 'q', 'hits', 'provenance', 'buildReport'],
    properties: {
      scopeId: { type: 'string' },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
      q: { type: 'string' },
      hits: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'documentId',
            'documentTitle',
            'documentVersionId',
            'documentVersionTitle',
            'itemKind',
            'anchor',
            'depth',
            'title',
            'breadcrumb',
            'score',
            'excerpt',
            'matchedBy',
            'lexicalScore',
          ],
          properties: {
            documentId: { type: 'string' },
            documentTitle: { type: 'string' },
            documentSlug: { type: 'string' },
            documentVersionId: { type: 'string' },
            documentVersionTitle: { type: 'string' },
            documentVersionNumber: { type: 'number' },
            itemKind: { enum: ['section', 'page'] },
            anchor: { type: 'string' },
            parentAnchor: { type: 'string' },
            number: { type: 'string' },
            depth: { type: 'number' },
            title: { type: 'string' },
            breadcrumb: { type: 'string' },
            sectionId: { type: 'string' },
            sectionUid: { type: 'string' },
            sectionSlug: { type: 'string' },
            pageId: { type: 'string' },
            pageUid: { type: 'string' },
            pageVersionId: { type: 'string' },
            format: { enum: ['md', 'mdx'] },
            pageNumberStart: { type: 'number' },
            pageNumberEnd: { type: 'number' },
            score: { type: 'number' },
            excerpt: { type: 'string' },
            matchedBy: {
              type: 'array',
              items: { enum: ['title', 'breadcrumb', 'number', 'bodyText', 'summaryText', 'semanticVector'] },
            },
            lexicalScore: { type: 'number' },
            semanticScore: { type: 'number' },
          },
        },
      },
      provenance: {
        type: 'object',
        additionalProperties: false,
        required: [
          'strategy',
          'retrievalStrategy',
          'totalDocumentCount',
          'searchedDocumentCount',
          'autoBuiltDocumentCount',
          'failedDocumentCount',
        ],
        properties: {
          strategy: { enum: ['lexical-search-v1', 'hybrid-search-v1', 'semantic-search-v1'] },
          retrievalStrategy: { enum: ['lexical', 'hybrid', 'semantic'] },
          totalDocumentCount: { type: 'number' },
          searchedDocumentCount: { type: 'number' },
          autoBuiltDocumentCount: { type: 'number' },
          failedDocumentCount: { type: 'number' },
        },
      },
      buildReport: {
        type: 'object',
        additionalProperties: false,
        required: ['autoBuiltDocumentVersionIds', 'failures'],
        properties: {
          autoBuiltDocumentVersionIds: {
            type: 'array',
            items: { type: 'string' },
          },
          failures: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['stage', 'message'],
              properties: {
                documentId: { type: 'string' },
                documentTitle: { type: 'string' },
                documentVersionId: { type: 'string' },
                stage: { enum: ['resolve-latest-version', 'build-index', 'search'] },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentAnswerPackInput]: {
    $ref: DOCMAN_OPERATION_SCHEMA_REFS.documentSearchInput,
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentAnswerPackOutput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId', 'q', 'built', 'answer', 'answerSource', 'citations', 'provenance'],
    properties: {
      documentVersionId: { type: 'string' },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
      q: { type: 'string' },
      built: { type: 'boolean' },
      buildFingerprint: { type: 'string' },
      answer: { type: 'string' },
      answerSource: { enum: ['summary', 'excerpt', 'title', 'none'] },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'itemKind',
            'anchor',
            'depth',
            'title',
            'breadcrumb',
            'score',
            'excerpt',
            'matchedBy',
            'lexicalScore',
          ],
          properties: {
            itemKind: { enum: ['document', 'section', 'page'] },
            anchor: { type: 'string' },
            parentAnchor: { type: 'string' },
            number: { type: 'string' },
            depth: { type: 'number' },
            title: { type: 'string' },
            breadcrumb: { type: 'string' },
            sectionId: { type: 'string' },
            sectionUid: { type: 'string' },
            sectionSlug: { type: 'string' },
            pageId: { type: 'string' },
            pageUid: { type: 'string' },
            pageVersionId: { type: 'string' },
            format: { enum: ['md', 'mdx'] },
            pageNumberStart: { type: 'number' },
            pageNumberEnd: { type: 'number' },
            score: { type: 'number' },
            excerpt: { type: 'string' },
            summaryText: { type: 'string' },
            lexicalScore: { type: 'number' },
            semanticScore: { type: 'number' },
            matchedBy: {
              type: 'array',
              items: { enum: ['title', 'breadcrumb', 'number', 'bodyText', 'summaryText', 'semanticVector'] },
            },
          },
        },
      },
      provenance: {
        type: 'object',
        additionalProperties: false,
        required: [
          'strategy',
          'retrievalStrategy',
          'citationCount',
          'primaryMatchedBy',
          'vectorAvailable',
        ],
        properties: {
          strategy: {
            enum: ['deterministic-answer-pack-v1', 'hybrid-answer-pack-v1', 'semantic-answer-pack-v1'],
          },
          retrievalStrategy: { enum: ['lexical', 'hybrid', 'semantic'] },
          citationCount: { type: 'number' },
          selectedAnchor: { type: 'string' },
          selectedItemKind: { enum: ['document', 'section', 'page'] },
          primaryMatchedBy: {
            type: 'array',
            items: { enum: ['title', 'breadcrumb', 'number', 'bodyText', 'summaryText', 'semanticVector'] },
          },
          vectorAvailable: { type: 'boolean' },
          vectorProvider: { type: 'string' },
          vectorModel: { type: 'string' },
        },
      },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentComposeFetchInput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId'],
    properties: {
      documentVersionId: { type: 'string', minLength: 1 },
      sectionId: { type: 'string' },
      pageVersionId: { type: 'string' },
      pageNumber: { type: 'number' },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentComposeFetchOutput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId', 'kind', 'format', 'formats', 'content', 'assets'],
    properties: {
      documentVersionId: { type: 'string' },
      kind: { enum: ['document', 'section', 'page'] },
      format: { enum: ['md', 'mdx'] },
      formats: { type: 'array', items: { enum: ['md', 'mdx'] } },
      content: { type: 'string' },
      assets: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['token', 'ref', 'assetId', 'assetVersionId', 'assetVersion', 'kind', 'mime', 'href'],
          properties: {
            token: { type: 'string' },
            ref: { type: 'string' },
            assetId: { type: 'string' },
            assetVersionId: { type: 'string' },
            assetVersion: { type: 'number' },
            assetUid: { type: 'string' },
            slug: { type: 'string' },
            title: { type: 'string' },
            altText: { type: 'string' },
            kind: { type: 'string' },
            mime: { type: 'string' },
            href: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
      },
      pageNumber: { type: 'number' },
      sectionId: { type: 'string' },
      pageVersionId: { type: 'string' },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentPublishMaterializeInput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId', 'target'],
    properties: {
      documentVersionId: { type: 'string', minLength: 1 },
      target: { enum: ['markdown', 'html'] },
      sectionId: { type: 'string' },
      pageVersionId: { type: 'string' },
      pageNumber: { type: 'number' },
      locale: { type: 'string' },
      fallbackLocale: { type: 'string' },
    },
  },
  [DOCMAN_OPERATION_SCHEMA_REFS.documentPublishMaterializeOutput]: {
    type: 'object',
    additionalProperties: false,
    required: ['documentVersionId', 'kind', 'target', 'mediaType', 'format', 'formats', 'content', 'assets', 'warnings'],
    properties: {
      documentVersionId: { type: 'string' },
      kind: { enum: ['document', 'section', 'page'] },
      target: { enum: ['markdown', 'html'] },
      mediaType: { type: 'string' },
      format: { enum: ['md', 'mdx'] },
      formats: { type: 'array', items: { enum: ['md', 'mdx'] } },
      content: { type: 'string' },
      assets: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['token', 'ref', 'assetId', 'assetVersionId', 'assetVersion', 'kind', 'mime', 'href'],
          properties: {
            token: { type: 'string' },
            ref: { type: 'string' },
            assetId: { type: 'string' },
            assetVersionId: { type: 'string' },
            assetVersion: { type: 'number' },
            assetUid: { type: 'string' },
            slug: { type: 'string' },
            title: { type: 'string' },
            altText: { type: 'string' },
            kind: { type: 'string' },
            mime: { type: 'string' },
            href: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
      },
      warnings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'message'],
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
      pageNumber: { type: 'number' },
      sectionId: { type: 'string' },
      pageVersionId: { type: 'string' },
    },
  },
}

function inferOperationKind(operationId: string): DocmanOperationKind {
  const segments = operationId.split('.').map((segment) => segment.trim()).filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  if (CRUD_KINDS.has(last as Exclude<DocmanOperationKind, 'custom'>)) {
    return last as Exclude<DocmanOperationKind, 'custom'>
  }
  return 'custom'
}

function buildDefaultSchemaRefs(operationId: string): { inputRef: string; outputRef: string } {
  return {
    inputRef: `${operationId}.input`,
    outputRef: `${operationId}.output`,
  }
}

function parseSchemaRef(ref: string): { operationId: string; direction: SchemaDirection } | null {
  const normalized = String(ref ?? '').trim()
  if (!normalized) return null

  if (normalized.endsWith('.input')) {
    const operationId = normalized.slice(0, -'.input'.length)
    if (!operationId) return null
    return { operationId, direction: 'input' }
  }

  if (normalized.endsWith('.output')) {
    const operationId = normalized.slice(0, -'.output'.length)
    if (!operationId) return null
    return { operationId, direction: 'output' }
  }

  return null
}

function getGenericSchemaByKind(kind: DocmanOperationKind, direction: SchemaDirection): JsonSchema {
  if (kind === 'list') return direction === 'input' ? GENERIC_LIST_INPUT_SCHEMA : GENERIC_LIST_OUTPUT_SCHEMA
  if (kind === 'get') return direction === 'input' ? GENERIC_GET_INPUT_SCHEMA : GENERIC_GET_OUTPUT_SCHEMA
  if (kind === 'create') return direction === 'input' ? GENERIC_CREATE_INPUT_SCHEMA : GENERIC_OBJECT_OUTPUT_SCHEMA
  if (kind === 'update') return direction === 'input' ? GENERIC_UPDATE_INPUT_SCHEMA : GENERIC_OBJECT_OUTPUT_SCHEMA
  if (kind === 'delete') return direction === 'input' ? GENERIC_DELETE_INPUT_SCHEMA : GENERIC_VOID_OUTPUT_SCHEMA
  return direction === 'input' ? GENERIC_CUSTOM_INPUT_SCHEMA : GENERIC_CUSTOM_OUTPUT_SCHEMA
}

export function createDocmanSchemaRef(ref: string): DocmanOperationSchemaRef {
  return { $ref: String(ref ?? '').trim() }
}

export function getDocmanOperationIoSchemaRefs(
  operationId: string,
): { inputRef: string; outputRef: string } | undefined {
  const normalized = normalizeDocmanOperationId(operationId)
  if (!normalized) return undefined

  const override = OPERATION_IO_SCHEMA_REF_OVERRIDES[normalized]
  if (override) return override

  return buildDefaultSchemaRefs(normalized)
}

export function getDocmanContractSchema(ref: string): JsonSchema | undefined {
  const normalizedRef = String(ref ?? '').trim()
  if (!normalizedRef) return undefined

  const override = OVERRIDE_SCHEMAS_BY_REF[normalizedRef]
  if (override) return override

  const parsed = parseSchemaRef(normalizedRef)
  if (!parsed) return undefined

  const operationId = normalizeDocmanOperationId(parsed.operationId)
  if (!operationId) return undefined

  const kind = inferOperationKind(operationId)
  return getGenericSchemaByKind(kind, parsed.direction)
}

export function resolveDocmanSchemaRefName(schema: unknown): string | undefined {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return undefined
  const maybeRef = (schema as Record<string, unknown>).$ref
  if (typeof maybeRef !== 'string') return undefined
  const normalized = maybeRef.trim()
  return normalized || undefined
}

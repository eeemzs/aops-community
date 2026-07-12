import type {
  DocmanOperationArgument,
  DocmanOperationDocs,
  DocmanOperationEffect,
  DocmanOperationKind,
  DocmanOperationPolicy,
  DocmanOperationSchema,
  DocmanOperationSpec,
} from './types.js'
import { listDocmanOperationSpecs } from './catalog.js'

export type DocmanOperationSideEffect = DocmanOperationEffect

export type DocmanOperationContract = {
  operationId: string
  toolId: string
  summary: string
  kind: DocmanOperationKind
  sideEffect: DocmanOperationSideEffect
  serviceKey: string
  serviceEntity: string
  methodName: string
  args: DocmanOperationArgument[]
  tags?: string[]
  inputSchema?: DocmanOperationSchema
  outputSchema?: DocmanOperationSchema
  policy?: DocmanOperationPolicy
  examples?: string[]
  notes?: string[]
  antiPatterns?: string[]
  preconditions?: string[]
  postconditions?: string[]
}

type DocmanOperationPolicyRecord = {
  scope: 'tenant' | 'global' | 'workspace' | 'project'
  auth?: { required?: boolean; roles?: string[]; capabilities?: string[] }
  safety?: { destructive?: boolean; confirmationRequired?: boolean; applyRequired?: boolean }
  rateLimit?: { bucket: string; max: number; windowSeconds: number }
}

type DocmanOperationDocsRecord = {
  notes?: string[]
  antiPatterns?: string[]
  preconditions?: string[]
  postconditions?: string[]
}

const SUMMARY_OVERRIDES: Record<string, string> = {
  'document.compose.index': 'Build composed document index for a document version.',
  'document.index.build': 'Build persisted retrieval index rows for a document version.',
  'document.index.get': 'Read persisted retrieval index snapshot for a document version.',
  'document.summary.build': 'Build persisted document and section/page summaries for a document version.',
  'document.summary.get': 'Read persisted document and section/page summaries for a document version.',
  'document.search': 'Search persisted retrieval index rows for a document version.',
  'document.scope.search': 'Search persisted retrieval index rows across latest document versions in one scope.',
  'document.answer-pack': 'Read a deterministic answer pack with citations for a document version.',
  'document.compose.fetch': 'Fetch composed source fragment with resolved asset references.',
  'document.publish.materialize': 'Materialize publish-ready fragment into markdown or html output.',
  'document.delete.safe': 'Safely delete a document graph with orphan protection.',
  'document-version.delete.safe': 'Safely delete one document version with orphan protection.',
  'document-version.import-headings': 'Import a parsed markdown heading graph into a document version.',
  'document-section-link.usage.list': 'List document usage for a section.',
}

const DOCS_OVERRIDES: Record<string, DocmanOperationDocsRecord> = {
  'document.compose.index': {
    notes: [
      'route path /document-versions/:id/compose-index resolves documentVersionId from :id',
      'for direct domain API calls, compose bodies are plain payloads (no data wrapper)',
      'for agent invoke local-route calls, send pathParams.id for routes with :id',
    ],
    antiPatterns: [
      'sending compose payload as { "data": { ... } } in /api/docman calls',
    ],
    preconditions: ['documentVersionId must exist'],
    postconditions: ['returns deterministic section/page index snapshot for the version'],
  },
  'document.compose.fetch': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /document-versions/:id/compose-fetch injects documentVersionId from :id',
      'for agent invoke local-route calls, send pathParams.id; body.documentVersionId is optional on :id routes',
      'result returns resolved source text, effective compose format, and referenced asset metadata',
      'asset references are logical only: use asset://<assetUid-or-slug> or asset://<assetUid-or-slug>@<version>',
      'compose fetch does not expose raw asset ids, sourcePath values, or storageKey values inside returned source content',
    ],
    antiPatterns: ['sending compose fetch payload as { "input": { ... } }'],
    preconditions: ['documentVersionId must exist'],
    postconditions: ['returns resolved source fragment with kind, format, and asset metadata'],
  },
  'document.index.build': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /document-versions/:id/index injects documentVersionId from :id on host calls',
      'build deletes and rebuilds the persisted structural index for the selected version+locale tuple',
      'index rows are deterministic and derived from the same composed document traversal used by compose fetch/index',
    ],
    antiPatterns: [
      'sending index build payload as { "input": { ... } }',
      'treating persisted index rows as an editable source of truth',
    ],
    preconditions: ['documentVersionId must exist'],
    postconditions: ['returns persisted section/page retrieval snapshot with stable anchors and page ranges'],
  },
  'document.index.get': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /document-versions/:id/index resolves documentVersionId from :id on host calls',
      'get does not rebuild missing rows; build is explicit in this phase',
    ],
    antiPatterns: [
      'sending index get payload as { "input": { ... } }',
      'assuming get implicitly composes or rebuilds rows',
    ],
    preconditions: ['documentVersionId must exist'],
    postconditions: ['returns the last persisted retrieval snapshot for the selected locale tuple'],
  },
  'document.summary.build': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /document-versions/:id/summaries injects documentVersionId from :id on host calls',
      'build explicitly refreshes the persisted index first, then derives deterministic document/section/page summaries for the same locale tuple',
      'document summary prefers authored document-version/document summary text when present; section and page summaries stay deterministic and extractive in this sprint slice',
    ],
    antiPatterns: [
      'sending summary build payload as { "input": { ... } }',
      'treating persisted summary rows as hand-edited authored content',
    ],
    preconditions: ['documentVersionId must exist'],
    postconditions: ['returns persisted document/section/page summaries with source and summary token counts'],
  },
  'document.summary.get': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /document-versions/:id/summaries resolves documentVersionId from :id on host calls',
      'get does not rebuild missing summaries; summary build is explicit in this phase',
    ],
    antiPatterns: [
      'sending summary get payload as { "input": { ... } }',
      'assuming get implicitly rebuilds the persisted index or summary rows',
    ],
    preconditions: ['documentVersionId must exist'],
    postconditions: ['returns the last persisted summary snapshot for the selected locale tuple'],
  },
  'document.search': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /document-versions/:id/search resolves documentVersionId from :id on host calls',
      'search stays db-agnostic: lexical, hybrid, and semantic ranking all run on persisted retrieval rows instead of vendor-specific DB FTS/vector features',
      'set retrievalStrategy to lexical, hybrid, or semantic depending on how much vector reranking you want',
      'search expects document.index.build to have populated rows for the same locale tuple first',
    ],
    antiPatterns: [
      'sending search payload as { "input": { ... } }',
      'expecting search to auto-build missing retrieval rows',
    ],
    preconditions: ['documentVersionId must exist', 'q must be non-empty'],
    postconditions: ['returns compact section/page hits with anchors, breadcrumbs, scores, and excerpts'],
  },
  'document.scope.search': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /scopes/:id/documents/search resolves scopeId from :id on host calls',
      'scope-wide search lists documents inside the scope and searches only the latest/current document version for each document',
      'scope-wide search auto-builds missing retrieval rows before searching each latest version',
      'result stays global-ranked and returns document-level provenance for every hit',
    ],
    antiPatterns: [
      'sending scope search payload as { "input": { ... } }',
      'expecting scope-wide search to include every historical document version',
    ],
    preconditions: ['scopeId must exist', 'q must be non-empty'],
    postconditions: ['returns globally ranked section/page hits plus document provenance, aggregate counts, and build failure metadata'],
  },
  'document.answer-pack': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /document-versions/:id/answer-pack resolves documentVersionId from :id on host calls',
      'answer-pack stays citation-first: it selects compact deterministic answer text from persisted document/section/page rows',
      'set retrievalStrategy to lexical, hybrid, or semantic depending on how much vector reranking you want',
      'answer-pack expects document.index.build or document.summary.build to have populated rows for the same locale tuple first',
      'result includes answer text, answerSource, citations, and provenance so agents can cite anchor/page evidence without re-reading full markdown',
    ],
    antiPatterns: [
      'sending answer-pack payload as { "input": { ... } }',
      'assuming answer-pack implicitly rebuilds missing index or summary rows',
    ],
    preconditions: ['documentVersionId must exist', 'q must be non-empty'],
    postconditions: ['returns compact answer text plus citable anchors, excerpts, matchedBy fields, and provenance metadata'],
  },
  'document.publish.materialize': {
    notes: [
      'operation accepts one flat payload object; legacy input envelopes are intentionally unsupported',
      'route path /document-versions/:id/materialize injects documentVersionId from :id',
      'for agent invoke local-route calls, send pathParams.id; body.documentVersionId is optional on :id routes',
      'target must be markdown or html',
      'markdown target preserves composed source text as-is',
      'html target omits MDX import/export preambles and returns deterministic inline HTML content',
      'materialize target dispatch is registry-backed internally so future artifact exporters can plug in without widening this generic invoke contract yet',
      'result payload stays JSON-friendly and returns text content, mediaType, warnings, and referenced assets',
    ],
    antiPatterns: [
      'sending materialize payload as { "input": { ... } }',
      'expecting a binary stream or download attachment from the generic invoke path',
    ],
    preconditions: ['documentVersionId must exist', 'target must be markdown or html'],
    postconditions: ['returns mediaType, content, warnings, and asset metadata for the selected fragment'],
  },
  'document.delete.safe': {
    notes: [
      'safe delete requires exact document title confirmation',
      'for agent invoke local-route calls, provide pathParams.id and body.confirmName',
    ],
    antiPatterns: ['calling safe delete without confirmName'],
    preconditions: ['id and confirmName are required'],
    postconditions: ['deletes orphan graph only and reports preserved shared nodes'],
  },
  'document-version.delete.safe': {
    notes: ['for agent invoke local-route calls, provide pathParams.id'],
    preconditions: ['id is required'],
    postconditions: ['deletes only target document version and reports preserved shared nodes'],
  },
  'document-version.import-headings': {
    notes: [
      'operation accepts one flat payload object with parsedGraph; markdown parsing belongs to CLI/tooling, not dm',
      'route path /document-versions/:id/import-headings resolves documentVersionId from :id on host calls',
      'for agent invoke local-route calls, send pathParams.id; body.documentVersionId is optional on :id routes',
      'default existingGraphPolicy is error; append and replace must be explicit',
      'H1 is ignored by the parser contract, H2/H3 are section nodes, and H4+ headings become page nodes',
      'direct body under H2/H3 section nodes is ignored in the MVP and returned as a warning',
      'set options.synthesizeOverviewPages=true to import direct H2/H3 body as child Overview pages',
      'doc mirror push remains a flat whole-document mirror migration path and is not changed by this operation',
    ],
    antiPatterns: [
      'sending raw markdown source directly to this dm operation',
      'using heading import as an implicit replace for an existing document graph',
    ],
    preconditions: ['documentVersionId must exist', 'scopeId must resolve from host context or input', 'parsedGraph.nodes is required'],
    postconditions: ['creates section/page/document-section-link graph rows and section-page-link memberships for imported page nodes'],
  },
  'document-version.create': {
    notes: ['version numbers are unique within one documentId'],
    antiPatterns: ['trying to create the same version number twice for one document'],
    preconditions: ['documentId must exist', 'version must be unique per documentId'],
    postconditions: ['creates exactly one new version row for the target document'],
  },
  'page-version.create': {
    notes: [
      'page-version owns source format; page remains format-agnostic identity metadata',
      'accepted source formats are md and mdx',
      'native compose/fetch accepts md and mdx page-version content only',
      'asset references inside md/mdx source should use asset://<assetUid-or-slug> or asset://<assetUid-or-slug>@<version>',
      'raw asset ids and filesystem-style asset paths are intentionally unsupported in page source',
    ],
    antiPatterns: [
      'assuming unsupported source types can still be stored as page-version.format values',
    ],
    preconditions: ['pageId must exist', 'version must be unique per pageId'],
    postconditions: ['creates exactly one new page-version row for the target page'],
  },
  'asset.create': {
    notes: [
      'asset is the durable logical owner for publish-grade resources such as images and attached files',
      'placement concerns stay outside asset identity and should continue through embed/page-embed-link style records',
    ],
    preconditions: ['assetUid must be unique per tenant'],
    postconditions: ['creates exactly one logical asset owner row'],
  },
  'asset-version.create': {
    notes: [
      'asset-version stores content-addressed source/publication metadata for one immutable resource revision',
      'mutable follow-up updates should stay limited to lifecycle metadata such as status, label, variants, or meta',
      'compose-time asset resolution expects a publication locator on sourceUrl when source content references this version',
    ],
    antiPatterns: [
      'using asset-version as the only page placement record',
      'patching storage locator or content hash instead of creating a new version',
    ],
    preconditions: ['assetId must exist', 'version must be unique per assetId'],
    postconditions: ['creates exactly one version row for the target asset'],
  },
  'asset-version.update': {
    notes: [
      'asset-version update is intended for lifecycle metadata only',
    ],
    antiPatterns: [
      'treating update as a substitute for creating a new content revision',
    ],
    preconditions: ['id is required', 'patch should only contain lifecycle metadata fields'],
    postconditions: ['updates lifecycle metadata without changing asset identity'],
  },
  'section-page-link.create': {
    notes: [
      'section-page links are flat; pages live directly under a section',
      'position must be unique within the same sectionId',
    ],
    antiPatterns: [
      'trying to attach one page under another page',
      'reusing the same position inside one sectionId',
    ],
    preconditions: [
      'position must be unique per sectionId',
      'sectionId must reference an existing section',
    ],
    postconditions: ['render order is deterministic by sectionId + position'],
  },
  'document-section-link.create': {
    notes: [
      'document trees can nest sections under sections',
      'pages are content nodes and may attach at document root or under a section container',
    ],
    antiPatterns: [
      'trying to attach one page under another page',
      'trying to nest a section under a page',
    ],
    preconditions: [
      'when parentLinkId is set, it must reference a section link',
    ],
    postconditions: ['document tree stays root-or-section -> page and section -> section/page shaped'],
  },
}

const CREATE_DATA_EXAMPLES: Record<string, Record<string, unknown>> = {
  'document-group.create': { groupUid: 'GRP-EXAMPLE-001', title: 'Guides' },
  'document.create': {
    documentUid: 'DOC-EXAMPLE-001',
    title: 'Sample document',
    summary: 'Sample summary',
    status: 'draft',
    visibility: 'internal',
  },
  'document-version.create': {
    documentId: '<documentId>',
    version: 1,
    status: 'draft',
    title: 'Sample document v1',
  },
  'section.create': { sectionUid: 'SEC-EXAMPLE-001', title: 'Introduction', kind: 'container' },
  'page.create': { pageUid: 'PAG-EXAMPLE-001', title: 'Sample page', kind: 'content' },
  'page-version.create': {
    pageId: '<pageId>',
    version: 1,
    status: 'draft',
    title: 'Sample page',
    format: 'md',
    content: '# Sample page\n\nBody.',
  },
  'document-section-link.create': {
    documentVersionId: '<documentVersionId>',
    kind: 'section',
    sectionId: '<sectionId>',
    position: 1,
  },
  'section-page-link.create': {
    sectionId: '<sectionId>',
    pageVersionId: '<pageVersionId>',
    position: 1,
  },
  'snippet.create': {
    snippetUid: 'SNP-EXAMPLE-001',
    language: 'ts',
    title: 'Hello snippet',
    code: 'console.log("hello")',
  },
  'page-snippet-link.create': {
    pageVersionId: '<pageVersionId>',
    snippetId: '<snippetId>',
    position: 1,
  },
  'asset.create': {
    assetUid: 'AST-EXAMPLE-001',
    kind: 'image',
    title: 'Architecture diagram',
    altText: 'System architecture overview',
  },
  'asset-version.create': {
    assetId: '<assetId>',
    version: 1,
    status: 'ready',
    filename: 'architecture.png',
    mime: 'image/png',
    contentHash: 'sha256:<hash>',
    sourceUrl: 'https://cdn.example.test/assets/architecture.v1.png',
  },
  'embed.create': {
    embedUid: 'EMB-EXAMPLE-001',
    type: 'image',
    title: 'Architecture',
    url: 'https://example.com/architecture.png',
  },
  'page-embed-link.create': {
    pageVersionId: '<pageVersionId>',
    embedId: '<embedId>',
    position: 1,
  },
}

const UPDATE_PATCH_EXAMPLES: Record<string, Record<string, unknown>> = {
  'document-group.update': { title: 'Updated group title' },
  'document.update': { title: 'Updated document title', summary: 'Updated summary' },
  'document-version.update': { title: 'Updated version title', status: 'draft' },
  'section.update': { title: 'Updated section title' },
  'page.update': { title: 'Updated page title' },
  'page-version.update': { title: 'Updated page version title' },
  'asset.update': { title: 'Updated asset title', altText: 'Updated alt text' },
  'asset-version.update': { status: 'ready', label: 'published' },
}

const LIST_FILTER_EXAMPLES: Record<string, Record<string, unknown>> = {
  'document.list': { status: 'draft' },
  'document-version.list': { documentId: '<documentId>' },
  'document-section-link.list': { documentVersionId: '<documentVersionId>' },
  'section-page-link.list': { sectionId: '<sectionId>' },
  'page-version.list': { pageId: '<pageId>' },
  'asset-version.list': { assetId: '<assetId>', status: 'ready' },
}

const LIST_OPTIONS_EXAMPLES: Record<string, Record<string, unknown>> = {
  'document.list': { includeVersionInfo: true },
}

const EXAMPLE_OVERRIDES: Record<string, Record<string, unknown>[]> = {
  'document.delete.safe': [{ id: '<documentId>', confirmName: '<documentTitle>' }],
  'document-version.delete.safe': [{ id: '<documentVersionId>' }],
  'document-version.import-headings': [
    {
      documentVersionId: '<documentVersionId>',
      parsedGraph: {
        sourceHash: '<sha256>',
        sourcePath: 'docs/ui-system-v2.md',
        nodes: [
          {
            kind: 'section',
            title: 'Navigation',
            children: [
              {
                kind: 'page',
                title: 'Behavior',
                bodyMarkdown: 'Page body.',
              },
            ],
          },
        ],
      },
      options: {
        dryRun: true,
        existingGraphPolicy: 'error',
        slugStrategy: 'hash-suffix-on-collision',
        bodyAssignment: 'leaf-page-content',
        headingToPagePolicy: 'h4-and-below',
        synthesizeOverviewPages: true,
      },
    },
  ],
  'document.compose.index': [
    {
      documentVersionId: '<documentVersionId>',
      options: { locale: 'en', fallbackLocale: 'tr' },
    },
  ],
  'document.compose.fetch': [
    {
      documentVersionId: '<documentVersionId>',
      pageNumber: 1,
      locale: 'en',
      fallbackLocale: 'tr',
    },
  ],
  'document.summary.build': [
    {
      documentVersionId: '<documentVersionId>',
      locale: 'en',
      fallbackLocale: 'tr',
    },
  ],
  'document.summary.get': [
    {
      documentVersionId: '<documentVersionId>',
      locale: 'en',
      fallbackLocale: 'tr',
    },
  ],
  'document.answer-pack': [
    {
      documentVersionId: '<documentVersionId>',
      q: 'regulator startup',
      limit: 3,
      locale: 'en',
      fallbackLocale: 'tr',
    },
  ],
  'document.scope.search': [
    {
      scopeId: '<scopeId>',
      q: 'regulator startup',
      limit: 8,
      retrievalStrategy: 'hybrid',
      locale: 'en',
      fallbackLocale: 'tr',
    },
  ],
  'document.publish.materialize': [
    {
      documentVersionId: '<documentVersionId>',
      target: 'html',
      locale: 'en',
      fallbackLocale: 'tr',
    },
  ],
  'document-section-link.create': [
    {
      data: {
        documentVersionId: '<documentVersionId>',
        kind: 'page',
        pageVersionId: '<rootPageVersionId>',
        position: 1,
      },
    },
    {
      data: {
        documentVersionId: '<documentVersionId>',
        kind: 'section',
        sectionId: '<sectionId>',
        position: 2,
      },
    },
    {
      data: {
        documentVersionId: '<documentVersionId>',
        kind: 'page',
        pageVersionId: '<sectionPageVersionId>',
        parentLinkId: '<sectionLinkId>',
        position: 1,
      },
    },
  ],
  'document-section-link.usage.list': [{ sectionId: '<sectionId>' }],
  'section-page-link.create': [
    {
      data: {
        sectionId: '<sectionId>',
        pageVersionId: '<rootPageVersionId>',
        position: 1,
      },
    },
    {
      data: {
        sectionId: '<sectionId>',
        pageVersionId: '<siblingPageVersionId>',
        position: 2,
      },
    },
  ],
}

function normalizeStringList(values: readonly string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined
  const unique = new Set<string>()
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (!normalized) continue
    unique.add(normalized)
  }
  if (unique.size === 0) return undefined
  return [...unique]
}

function mergeStringLists(...lists: Array<readonly string[] | undefined>): string[] | undefined {
  const unique = new Set<string>()
  for (const list of lists) {
    for (const item of list ?? []) {
      const normalized = String(item ?? '').trim()
      if (!normalized) continue
      unique.add(normalized)
    }
  }
  if (unique.size === 0) return undefined
  return [...unique]
}

function toSummary(operationId: string): string {
  const override = SUMMARY_OVERRIDES[operationId]
  if (override) return override

  const normalized = operationId
    .split('.')
    .flatMap((segment) => segment.split('-'))
    .join(' ')
    .trim()
  if (!normalized) return operationId
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function toSideEffect(kind: DocmanOperationKind): DocmanOperationSideEffect {
  if (kind === 'list' || kind === 'get') return 'none'
  if (kind === 'custom') return 'mixed'
  return 'db'
}

function isDestructiveOperation(spec: DocmanOperationSpec): boolean {
  return spec.kind === 'delete' || spec.operationId.includes('.delete.')
}

function toDefaultPolicy(spec: DocmanOperationSpec): DocmanOperationPolicy {
  const destructive = isDestructiveOperation(spec)
  const writeKind = spec.kind === 'create' || spec.kind === 'update' || spec.kind === 'delete'

  const policy: DocmanOperationPolicyRecord = {
    scope: 'tenant',
    auth: { required: true },
  }

  if (destructive || writeKind) {
    policy.safety = {
      destructive,
      applyRequired: true,
      confirmationRequired: spec.operationId.endsWith('.delete.safe'),
    }
    policy.rateLimit = {
      bucket: destructive ? 'docman-write-destructive' : 'docman-write',
      max: destructive ? 30 : 60,
      windowSeconds: 60,
    }
    return policy
  }

  policy.rateLimit = {
    bucket: 'docman-read',
    max: spec.kind === 'list' ? 180 : 240,
    windowSeconds: 60,
  }
  return policy
}

function toJsonExample(input: Record<string, unknown>): string {
  return JSON.stringify(input)
}

function toDefaultExampleFromArgs(spec: DocmanOperationSpec): string {
  const payload: Record<string, unknown> = {}

  for (const arg of spec.args) {
    if (arg.name === 'id') {
      payload.id = '<id>'
      continue
    }

    if (arg.name === 'data') {
      payload.data = CREATE_DATA_EXAMPLES[spec.operationId] ?? { key: '<value>' }
      continue
    }

    if (arg.name === 'patch') {
      payload.patch = UPDATE_PATCH_EXAMPLES[spec.operationId] ?? { key: '<value>' }
      continue
    }

    if (arg.name === 'filter') {
      payload.filter = LIST_FILTER_EXAMPLES[spec.operationId] ?? {}
      continue
    }

    if (arg.name === 'options') {
      payload.options = LIST_OPTIONS_EXAMPLES[spec.operationId] ?? {}
      continue
    }

    payload[arg.name] = `<${arg.name}>`
  }

  if (Object.keys(payload).length === 0) payload.input = '<payload>'
  return toJsonExample(payload)
}

function toDefaultExamples(spec: DocmanOperationSpec): string[] {
  const override = EXAMPLE_OVERRIDES[spec.operationId]
  if (override && override.length > 0) return override.map((entry) => toJsonExample(entry))
  return [toDefaultExampleFromArgs(spec)]
}

function toNormalizedDocs(
  defaults: DocmanOperationDocsRecord | undefined,
  fromSpec: DocmanOperationDocs | undefined,
): DocmanOperationDocsRecord {
  const notes = mergeStringLists(defaults?.notes, normalizeStringList(fromSpec?.notes))
  const antiPatterns = mergeStringLists(defaults?.antiPatterns, normalizeStringList(fromSpec?.antiPatterns))
  const preconditions = mergeStringLists(defaults?.preconditions, normalizeStringList(fromSpec?.preconditions))
  const postconditions = mergeStringLists(defaults?.postconditions, normalizeStringList(fromSpec?.postconditions))

  return {
    ...(notes ? { notes } : {}),
    ...(antiPatterns ? { antiPatterns } : {}),
    ...(preconditions ? { preconditions } : {}),
    ...(postconditions ? { postconditions } : {}),
  }
}

function fromSpec(spec: DocmanOperationSpec): DocmanOperationContract {
  const summary = typeof spec.summary === 'string' ? spec.summary.trim() : ''
  const policy = spec.policy ?? toDefaultPolicy(spec)
  const examples = spec.examples && spec.examples.length > 0 ? [...spec.examples] : toDefaultExamples(spec)
  const docs = toNormalizedDocs(DOCS_OVERRIDES[spec.operationId], spec.docs)

  return {
    operationId: spec.operationId,
    toolId: spec.toolId,
    summary: summary || toSummary(spec.operationId),
    kind: spec.kind,
    sideEffect: spec.sideEffect ?? toSideEffect(spec.kind),
    serviceKey: spec.serviceKey,
    serviceEntity: spec.serviceEntity,
    methodName: spec.methodName,
    args: spec.args.map((arg) => ({ ...arg })),
    ...(spec.tags ? { tags: [...spec.tags] } : {}),
    ...(spec.inputSchema !== undefined ? { inputSchema: spec.inputSchema } : {}),
    ...(spec.outputSchema !== undefined ? { outputSchema: spec.outputSchema } : {}),
    ...(policy !== undefined ? { policy } : {}),
    ...(examples.length > 0 ? { examples } : {}),
    ...(docs.notes ? { notes: docs.notes } : {}),
    ...(docs.antiPatterns ? { antiPatterns: docs.antiPatterns } : {}),
    ...(docs.preconditions ? { preconditions: docs.preconditions } : {}),
    ...(docs.postconditions ? { postconditions: docs.postconditions } : {}),
  }
}

export function listDocmanOperationContracts(options?: { refresh?: boolean }): DocmanOperationContract[] {
  return listDocmanOperationSpecs(options).map(fromSpec)
}

export function getDocmanOperationContractByToolId(toolId: string, options?: { refresh?: boolean }): DocmanOperationContract | null {
  const operations = listDocmanOperationContracts(options)
  return operations.find((operation) => operation.toolId === toolId) ?? null
}

export function getDocmanOperationContractById(operationId: string, options?: { refresh?: boolean }): DocmanOperationContract | null {
  const operations = listDocmanOperationContracts(options)
  return operations.find((operation) => operation.operationId === operationId) ?? null
}

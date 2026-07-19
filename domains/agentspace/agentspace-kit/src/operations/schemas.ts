import { z } from 'zod'

import type { AgentspaceOperationKind, AgentspaceOperationSchemaRef } from './types.js'
import { normalizeAgentspaceOperationId } from './definition.js'
import { AGENTSPACE_OPERATION_CATALOG_ROWS } from './catalog.data.js'

type JsonSchema = Record<string, unknown>
type SchemaDirection = 'input' | 'output'

const CRUD_KINDS = new Set<Exclude<AgentspaceOperationKind, 'custom'>>(['list', 'get', 'create', 'update', 'delete'])

const GENERIC_LIST_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    filter: { type: 'object', additionalProperties: true },
    options: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_GET_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
}

const GENERIC_CREATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
}

const GENERIC_UPDATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
}

const GENERIC_DELETE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
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

const GENERIC_FLEXIBLE_FIELD_SCHEMA: JsonSchema = {
  anyOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'integer' },
    { type: 'boolean' },
    { type: 'null' },
    { type: 'object', additionalProperties: true },
    { type: 'array', items: { type: 'object', additionalProperties: true } },
  ],
}

const JSON_VALUE_SCHEMA: JsonSchema = {
  anyOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'integer' },
    { type: 'boolean' },
    { type: 'null' },
    { type: 'object', additionalProperties: true },
    { type: 'array', items: {} },
  ],
}

const CODEX_CHAT_MESSAGE_CREATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['projectId', 'threadId', 'role', 'text', 'messageAt', 'seq'],
      properties: {
        projectId: { type: 'string', minLength: 1 },
        threadId: { type: 'string', minLength: 1 },
        externalThreadId: { type: 'string', minLength: 1 },
        role: { type: 'string', enum: ['user', 'assistant', 'system'] },
        text: { type: 'string', minLength: 1 },
        turnId: { type: 'string', minLength: 1 },
        itemId: { type: 'string', minLength: 1 },
        messageAt: { type: 'string', minLength: 1 },
        seq: { type: 'integer', minimum: 1 },
        createdBy: { type: 'string', minLength: 1 },
        updatedBy: { type: 'string', minLength: 1 },
      },
    },
  },
}

const CODEX_CHAT_THREAD_CREATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['scopeId', 'externalThreadId'],
      properties: {
        scopeId: { type: 'string', minLength: 1 },
        externalThreadId: { type: 'string', minLength: 1 },
        scopeLabel: { type: 'string', minLength: 1 },
        cwd: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
        tags: { type: 'array', items: { type: 'string', minLength: 1 } },
        lastPrompt: { type: 'string', minLength: 1 },
        lastAssistant: { type: 'string', minLength: 1 },
        tokenInput: { type: ['integer', 'null'], minimum: 0 },
        tokenOutput: { type: ['integer', 'null'], minimum: 0 },
        tokenTotal: { type: ['integer', 'null'], minimum: 0 },
        lastMessageAt: { type: 'string', minLength: 1 },
        createdBy: { type: 'string', minLength: 1 },
        updatedBy: { type: 'string', minLength: 1 },
      },
    },
  },
}

const PROJECT_CREATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: true,
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1 },
      },
    },
  },
}

const PROJECT_PATH_UPSERT_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: true,
      required: ['projectId', 'pathKey', 'path'],
      properties: {
        projectId: { type: 'string', minLength: 1 },
        pathKey: { type: 'string', minLength: 1 },
        path: { type: 'string', minLength: 1 },
      },
    },
  },
}

const RESOURCE_CREATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: true,
      required: ['scopeId', 'name', 'resourceType'],
      properties: {
        scopeId: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        resourceType: {
          type: 'string',
          enum: ['document', 'rule', 'spec', 'link', 'reference', 'template', 'dataset', 'code', 'skill'],
        },
        description: { type: 'string' },
        uri: { type: 'string', minLength: 1 },
        tags: { type: 'array', items: { type: 'string', minLength: 1 } },
        refType: { type: 'string', minLength: 1 },
        refId: { type: 'string', minLength: 1 },
        createdBy: { type: 'string', minLength: 1 },
        updatedBy: { type: 'string', minLength: 1 },
        meta: { type: 'object', additionalProperties: true },
      },
    },
  },
}

const NON_EMPTY_STRING_SCHEMA: JsonSchema = { type: 'string', minLength: 1 }
const STRING_ARRAY_SCHEMA: JsonSchema = {
  type: 'array',
  items: NON_EMPTY_STRING_SCHEMA,
}
const STRING_RECORD_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: NON_EMPTY_STRING_SCHEMA,
}
const DB_OPTIONS_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
}
const SKILL_DISCOVERY_INPUT_SCHEMA: JsonSchema = objectSchema({
  query: { type: 'string', minLength: 1, maxLength: 256 },
  scopeId: NON_EMPTY_STRING_SCHEMA,
  scopeResolution: { type: 'string', enum: ['explicit', 'cascade'] },
  limit: { type: 'integer', minimum: 1, maximum: 5 },
}, ['query'])
const SHA256_SCHEMA: JsonSchema = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const SKILL_DISCOVERY_MATCH_FIELD_SCHEMA: JsonSchema = {
  anyOf: [
    { enum: ['name', 'shortDescription', 'description', 'tags', 'version', 'entryFile', 'skillStandard'] },
    { type: 'string', pattern: '^meta\\.[A-Za-z0-9_.-]+$', maxLength: 96 },
  ],
}
const SKILL_DISCOVERY_CANDIDATE_SCHEMA: JsonSchema = objectSchema({
  skillId: NON_EMPTY_STRING_SCHEMA,
  versionId: NON_EMPTY_STRING_SCHEMA,
  exactRef: { type: 'string', pattern: '^skill-version:.+' },
  name: { type: 'string', minLength: 1, maxLength: 80 },
  shortDescription: { type: 'string', minLength: 1, maxLength: 96 },
  version: NON_EMPTY_STRING_SCHEMA,
  entryFile: NON_EMPTY_STRING_SCHEMA,
  skillStandard: NON_EMPTY_STRING_SCHEMA,
  packageSha256: SHA256_SCHEMA,
  contentSha256: SHA256_SCHEMA,
  origin: { const: 'hosted' },
  computedTrustClass: { const: 'verified-hosted-package' },
  score: { type: 'integer', minimum: 1 },
  matchedBy: {
    type: 'array',
    minItems: 1,
    maxItems: 5,
    uniqueItems: true,
    items: SKILL_DISCOVERY_MATCH_FIELD_SCHEMA,
  },
  rationale: { type: 'string', minLength: 1, maxLength: 160 },
}, [
  'skillId',
  'versionId',
  'exactRef',
  'name',
  'version',
  'entryFile',
  'skillStandard',
  'packageSha256',
  'contentSha256',
  'origin',
  'computedTrustClass',
  'score',
  'matchedBy',
  'rationale',
])
const SKILL_SEARCH_OUTPUT_SCHEMA: JsonSchema = objectSchema({
  query: NON_EMPTY_STRING_SCHEMA,
  normalizedQuery: NON_EMPTY_STRING_SCHEMA,
  count: { type: 'integer', minimum: 0, maximum: 5 },
  candidates: { type: 'array', maxItems: 5, items: SKILL_DISCOVERY_CANDIDATE_SCHEMA },
}, ['query', 'normalizedQuery', 'count', 'candidates'])
const SKILL_ASK_OUTPUT_SCHEMA: JsonSchema = objectSchema({
  query: NON_EMPTY_STRING_SCHEMA,
  normalizedQuery: NON_EMPTY_STRING_SCHEMA,
  count: { type: 'integer', minimum: 0, maximum: 5 },
  candidates: { type: 'array', maxItems: 5, items: SKILL_DISCOVERY_CANDIDATE_SCHEMA },
  answer: { type: 'string', maxLength: 1024 },
}, ['query', 'normalizedQuery', 'count', 'candidates', 'answer'])
const SKILL_PACKAGE_FILE_DIGEST_SCHEMA: JsonSchema = objectSchema({
  path: NON_EMPTY_STRING_SCHEMA,
  sha256: SHA256_SCHEMA,
  byteLength: { type: 'integer', minimum: 0 },
}, ['path', 'sha256', 'byteLength'])
const SKILL_PACKAGE_COMPATIBILITY_SCHEMA: JsonSchema = objectSchema({
  minCliVersion: NON_EMPTY_STRING_SCHEMA,
  maxSchemaVersion: { const: 1 },
}, ['minCliVersion', 'maxSchemaVersion'])
const SKILL_PACKAGE_MANIFEST_SCHEMA: JsonSchema = objectSchema({
  schemaVersion: { const: 1 },
  assetKind: { const: 'skill-package' },
  name: NON_EMPTY_STRING_SCHEMA,
  version: NON_EMPTY_STRING_SCHEMA,
  versionId: NON_EMPTY_STRING_SCHEMA,
  entryFile: { const: 'SKILL.md' },
  standard: { const: 'aops-skill-package-v1' },
  packageSha256: SHA256_SCHEMA,
  files: { type: 'array', minItems: 1, items: SKILL_PACKAGE_FILE_DIGEST_SCHEMA },
  compatibility: SKILL_PACKAGE_COMPATIBILITY_SCHEMA,
  provenance: objectSchema({
    trustClass: { const: 'verified-hosted-package' },
    expectedDigestSource: { const: 'immutable-hosted-metadata' },
    reference: NON_EMPTY_STRING_SCHEMA,
  }, ['trustClass', 'expectedDigestSource', 'reference']),
}, ['schemaVersion', 'assetKind', 'name', 'version', 'versionId', 'entryFile', 'standard', 'packageSha256', 'files', 'compatibility', 'provenance'])
const SKILL_PACKAGE_TRANSFER_FILE_SCHEMA: JsonSchema = objectSchema({
  path: NON_EMPTY_STRING_SCHEMA,
  content: { type: 'string' },
  kind: { type: 'string' },
  encoding: { type: 'string' },
  mimeType: { type: 'string' },
}, ['path', 'content'])
const SKILL_PACKAGE_EXPORT_OUTPUT_SCHEMA: JsonSchema = objectSchema({
  skillVersionId: NON_EMPTY_STRING_SCHEMA,
  skillId: NON_EMPTY_STRING_SCHEMA,
  skillName: NON_EMPTY_STRING_SCHEMA,
  projectId: NON_EMPTY_STRING_SCHEMA,
  scopeId: NON_EMPTY_STRING_SCHEMA,
  files: { type: 'array', minItems: 1, items: SKILL_PACKAGE_TRANSFER_FILE_SCHEMA },
  metadata: { type: 'object', additionalProperties: true },
  manifest: SKILL_PACKAGE_MANIFEST_SCHEMA,
  package: objectSchema({
    entryFile: { const: 'SKILL.md' },
    standard: { const: 'aops-skill-package-v1' },
    format: { const: 'filesystem-skill-package' },
    fileCount: { type: 'integer', minimum: 1 },
    metadata: { type: 'object', additionalProperties: true },
    compatibility: SKILL_PACKAGE_COMPATIBILITY_SCHEMA,
  }, ['entryFile', 'standard', 'format', 'fileCount', 'compatibility']),
}, ['skillVersionId', 'skillId', 'skillName', 'projectId', 'scopeId', 'files', 'metadata', 'manifest', 'package'])
const OFFICIAL_CATALOG_SCOPE_SCHEMA: JsonSchema = objectSchema({
  schemaVersion: { const: 1 },
  slug: { const: 'aops-official-catalog' },
  kind: { const: 'agentspace-skill-catalog' },
  owner: { const: 'aops-community-setup' },
  reserved: { const: true },
}, ['schemaVersion', 'slug', 'kind', 'owner', 'reserved'])
const OFFICIAL_CATALOG_CURRENT_MAP_SCHEMA: JsonSchema = {
  type: 'object',
  propertyNames: { type: 'string', minLength: 1 },
  additionalProperties: { anyOf: [NON_EMPTY_STRING_SCHEMA, { type: 'null' }] },
}
const OFFICIAL_CATALOG_VERSION_SCHEMA: JsonSchema = objectSchema({
  recordId: NON_EMPTY_STRING_SCHEMA,
  skillId: NON_EMPTY_STRING_SCHEMA,
  name: NON_EMPTY_STRING_SCHEMA,
  versionId: NON_EMPTY_STRING_SCHEMA,
  packageSha256: SHA256_SCHEMA,
  releaseSetSha256: SHA256_SCHEMA,
  status: { const: 'published' },
  inert: { const: true },
}, ['recordId', 'skillId', 'name', 'versionId', 'packageSha256', 'releaseSetSha256', 'status', 'inert'])
const OFFICIAL_CATALOG_SNAPSHOT_SCHEMA: JsonSchema = objectSchema({
  schemaVersion: { const: 1 },
  scopeSlug: { const: 'aops-official-catalog' },
  state: { type: 'string', enum: ['absent', 'ready'] },
  scopeId: { anyOf: [NON_EMPTY_STRING_SCHEMA, { type: 'null' }] },
  projectId: { anyOf: [NON_EMPTY_STRING_SCHEMA, { type: 'null' }] },
  catalogRevision: { type: 'integer', minimum: 0 },
  currentVersionMap: OFFICIAL_CATALOG_CURRENT_MAP_SCHEMA,
  versions: { type: 'array', items: OFFICIAL_CATALOG_VERSION_SCHEMA },
  lastReceiptId: { anyOf: [NON_EMPTY_STRING_SCHEMA, { type: 'null' }] },
}, ['schemaVersion', 'scopeSlug', 'state', 'scopeId', 'projectId', 'catalogRevision', 'currentVersionMap', 'versions', 'lastReceiptId'])
const OFFICIAL_CATALOG_MANIFEST_SCHEMA: JsonSchema = objectSchema({
  schemaVersion: { const: 1 },
  assetKind: { const: 'skill-package' },
  name: NON_EMPTY_STRING_SCHEMA,
  version: NON_EMPTY_STRING_SCHEMA,
  versionId: NON_EMPTY_STRING_SCHEMA,
  entryFile: { const: 'SKILL.md' },
  standard: { const: 'aops-skill-package-v1' },
  packageSha256: SHA256_SCHEMA,
  files: { type: 'array', minItems: 1, maxItems: 256, items: SKILL_PACKAGE_FILE_DIGEST_SCHEMA },
  compatibility: SKILL_PACKAGE_COMPATIBILITY_SCHEMA,
  provenance: objectSchema({
    trustClass: { const: 'verified-hosted-package' },
    expectedDigestSource: { const: 'immutable-hosted-metadata' },
    reference: NON_EMPTY_STRING_SCHEMA,
    releaseSha256: SHA256_SCHEMA,
    signatureRef: NON_EMPTY_STRING_SCHEMA,
  }, ['trustClass', 'expectedDigestSource', 'reference']),
}, ['schemaVersion', 'assetKind', 'name', 'version', 'versionId', 'entryFile', 'standard', 'packageSha256', 'files', 'provenance'])
const OFFICIAL_CATALOG_FILE_SCHEMA: JsonSchema = objectSchema({
  path: NON_EMPTY_STRING_SCHEMA,
  sha256: SHA256_SCHEMA,
  byteLength: { type: 'integer', minimum: 0, maximum: 524288 },
  content: { type: 'string' },
}, ['path', 'sha256', 'byteLength', 'content'])
const OFFICIAL_CATALOG_PACKAGE_SCHEMA: JsonSchema = objectSchema({
  name: NON_EMPTY_STRING_SCHEMA,
  version: NON_EMPTY_STRING_SCHEMA,
  versionId: NON_EMPTY_STRING_SCHEMA,
  packageSha256: SHA256_SCHEMA,
  manifestSha256: SHA256_SCHEMA,
  entryFile: { const: 'SKILL.md' },
  manifest: OFFICIAL_CATALOG_MANIFEST_SCHEMA,
  files: { type: 'array', minItems: 1, maxItems: 256, items: OFFICIAL_CATALOG_FILE_SCHEMA },
  meta: objectSchema({
    aopsOfficialCatalog: objectSchema({
      schemaVersion: { const: 1 },
      scopeSlug: { const: 'aops-official-catalog' },
      source: { const: 'signed-community-release' },
      releaseSetSha256: SHA256_SCHEMA,
      manifestSha256: SHA256_SCHEMA,
      packageSha256: SHA256_SCHEMA,
      inert: { const: true },
    }, ['schemaVersion', 'scopeSlug', 'source', 'releaseSetSha256', 'manifestSha256', 'packageSha256', 'inert']),
  }, ['aopsOfficialCatalog']),
}, ['name', 'version', 'versionId', 'packageSha256', 'manifestSha256', 'entryFile', 'manifest', 'files', 'meta'])
const OFFICIAL_CATALOG_ACTION_SCHEMA: JsonSchema = objectSchema({
  name: NON_EMPTY_STRING_SCHEMA,
  action: { type: 'string', enum: ['append-version', 'set-current', 'clear-current', 'unchanged'] },
  versionId: { anyOf: [NON_EMPTY_STRING_SCHEMA, { type: 'null' }] },
  packageSha256: { anyOf: [SHA256_SCHEMA, { type: 'null' }] },
  existingRecordId: { anyOf: [NON_EMPTY_STRING_SCHEMA, { type: 'null' }] },
}, ['name', 'action', 'versionId', 'packageSha256', 'existingRecordId'])
const OFFICIAL_CATALOG_RECONCILE_PLAN_SCHEMA: JsonSchema = objectSchema({
  schemaVersion: { const: 1 },
  kind: { const: 'aops-official-catalog-reconcile-plan-v1' },
  scope: OFFICIAL_CATALOG_SCOPE_SCHEMA,
  releaseSetSha256: SHA256_SCHEMA,
  expectedCatalogRevision: { type: 'integer', minimum: 0 },
  expectedPreviousReceiptId: { anyOf: [NON_EMPTY_STRING_SCHEMA, { type: 'null' }] },
  expectedCurrentVersionMap: OFFICIAL_CATALOG_CURRENT_MAP_SCHEMA,
  desiredPackageVersionMap: OFFICIAL_CATALOG_CURRENT_MAP_SCHEMA,
  packages: { type: 'array', minItems: 1, items: OFFICIAL_CATALOG_PACKAGE_SCHEMA },
  actions: { type: 'array', items: OFFICIAL_CATALOG_ACTION_SCHEMA },
  mutationRequired: { type: 'boolean' },
  activationEffects: { type: 'array', maxItems: 0 },
  historyDeleteCount: { const: 0 },
  idempotencyKey: NON_EMPTY_STRING_SCHEMA,
}, ['schemaVersion', 'kind', 'scope', 'releaseSetSha256', 'expectedCatalogRevision', 'expectedPreviousReceiptId', 'expectedCurrentVersionMap', 'desiredPackageVersionMap', 'packages', 'actions', 'mutationRequired', 'activationEffects', 'historyDeleteCount', 'idempotencyKey'])
const OFFICIAL_CATALOG_ROLLBACK_REQUEST_SCHEMA: JsonSchema = objectSchema({
  schemaVersion: { const: 1 },
  kind: { const: 'aops-official-catalog-rollback-request-v1' },
  scope: OFFICIAL_CATALOG_SCOPE_SCHEMA,
  receiptId: NON_EMPTY_STRING_SCHEMA,
  expectedCatalogRevision: { type: 'integer', minimum: 0 },
  idempotencyKey: NON_EMPTY_STRING_SCHEMA,
  deleteHistory: { const: false },
  activationEffects: { type: 'array', maxItems: 0 },
}, ['schemaVersion', 'kind', 'scope', 'receiptId', 'expectedCatalogRevision', 'idempotencyKey', 'deleteHistory', 'activationEffects'])
const OFFICIAL_CATALOG_RECEIPT_SCHEMA: JsonSchema = objectSchema({
  schemaVersion: { const: 1 },
  kind: { const: 'aops-official-catalog-receipt-v1' },
  receiptId: NON_EMPTY_STRING_SCHEMA,
  operation: { type: 'string', enum: ['reconcile', 'rollback'] },
  scopeSlug: { const: 'aops-official-catalog' },
  scopeId: NON_EMPTY_STRING_SCHEMA,
  projectId: NON_EMPTY_STRING_SCHEMA,
  catalogRevision: { type: 'integer', minimum: 1 },
  releaseSetSha256: SHA256_SCHEMA,
  priorCurrentVersionMap: OFFICIAL_CATALOG_CURRENT_MAP_SCHEMA,
  currentVersionMap: OFFICIAL_CATALOG_CURRENT_MAP_SCHEMA,
  packageSha256: { type: 'array', uniqueItems: true, items: SHA256_SCHEMA },
  historyDeleteCount: { const: 0 },
  activationEffects: { type: 'array', maxItems: 0 },
  previousReceiptId: { anyOf: [NON_EMPTY_STRING_SCHEMA, { type: 'null' }] },
  createdAt: NON_EMPTY_STRING_SCHEMA,
}, ['schemaVersion', 'kind', 'receiptId', 'operation', 'scopeSlug', 'scopeId', 'projectId', 'catalogRevision', 'releaseSetSha256', 'priorCurrentVersionMap', 'currentVersionMap', 'packageSha256', 'historyDeleteCount', 'activationEffects', 'previousReceiptId', 'createdAt'])
const OFFICIAL_CATALOG_INSPECT_INPUT_SCHEMA: JsonSchema = objectSchema({ scope: OFFICIAL_CATALOG_SCOPE_SCHEMA }, ['scope'])
const OFFICIAL_CATALOG_RECONCILE_INPUT_SCHEMA: JsonSchema = objectSchema({ plan: OFFICIAL_CATALOG_RECONCILE_PLAN_SCHEMA }, ['plan'])
const OFFICIAL_CATALOG_ROLLBACK_INPUT_SCHEMA: JsonSchema = objectSchema({ request: OFFICIAL_CATALOG_ROLLBACK_REQUEST_SCHEMA }, ['request'])
const CHAT_ROOM_STATUS_SCHEMA: JsonSchema = { type: 'string', enum: ['active', 'archived'] }
const CHAT_MEMBER_STATUS_SCHEMA: JsonSchema = { type: 'string', enum: ['active', 'left'] }
const CHAT_MESSAGE_KIND_SCHEMA: JsonSchema = { type: 'string', enum: ['message'] }

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function dataEnvelope(dataSchema: JsonSchema): JsonSchema {
  return objectSchema({ data: dataSchema }, ['data'])
}

function patchEnvelope(patchSchema: JsonSchema): JsonSchema {
  return objectSchema({
    id: NON_EMPTY_STRING_SCHEMA,
    patch: patchSchema,
  }, ['id', 'patch'])
}

function idEnvelope(extraProperties: Record<string, JsonSchema> = {}): JsonSchema {
  return objectSchema({
    id: NON_EMPTY_STRING_SCHEMA,
    ...extraProperties,
  }, ['id'])
}

const CHAT_MEMBER_CREATE_DATA_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  roomId: NON_EMPTY_STRING_SCHEMA,
  agentId: NON_EMPTY_STRING_SCHEMA,
  roleKey: NON_EMPTY_STRING_SCHEMA,
  brief: { type: 'string' },
  status: CHAT_MEMBER_STATUS_SCHEMA,
  lastReadSeq: { type: 'integer', minimum: 0 },
  createdBy: NON_EMPTY_STRING_SCHEMA,
  updatedBy: NON_EMPTY_STRING_SCHEMA,
}, ['scopeId', 'roomId', 'agentId'])

const CHAT_ROOM_INITIAL_MEMBER_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  roomId: NON_EMPTY_STRING_SCHEMA,
  agentId: NON_EMPTY_STRING_SCHEMA,
  roleKey: NON_EMPTY_STRING_SCHEMA,
  brief: { type: 'string' },
  status: CHAT_MEMBER_STATUS_SCHEMA,
  lastReadSeq: { type: 'integer', minimum: 0 },
  createdBy: NON_EMPTY_STRING_SCHEMA,
  updatedBy: NON_EMPTY_STRING_SCHEMA,
}, ['agentId'])

const CHAT_BINDING_CREATE_DATA_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  roomId: NON_EMPTY_STRING_SCHEMA,
  bindingType: NON_EMPTY_STRING_SCHEMA,
  refId: NON_EMPTY_STRING_SCHEMA,
  uri: NON_EMPTY_STRING_SCHEMA,
  title: { type: 'string' },
  note: { type: 'string' },
  createdBy: NON_EMPTY_STRING_SCHEMA,
  updatedBy: NON_EMPTY_STRING_SCHEMA,
}, ['scopeId', 'roomId', 'bindingType'])

const CHAT_ROOM_INITIAL_BINDING_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  roomId: NON_EMPTY_STRING_SCHEMA,
  bindingType: NON_EMPTY_STRING_SCHEMA,
  refId: NON_EMPTY_STRING_SCHEMA,
  uri: NON_EMPTY_STRING_SCHEMA,
  title: { type: 'string' },
  note: { type: 'string' },
  createdBy: NON_EMPTY_STRING_SCHEMA,
  updatedBy: NON_EMPTY_STRING_SCHEMA,
}, ['bindingType'])

const CHAT_ROOM_CREATE_DATA_SCHEMA: JsonSchema = {
  ...objectSchema({
    scopeId: NON_EMPTY_STRING_SCHEMA,
    projectId: NON_EMPTY_STRING_SCHEMA,
    slug: NON_EMPTY_STRING_SCHEMA,
    title: NON_EMPTY_STRING_SCHEMA,
    kind: { type: 'string', enum: ['group'] },
    purpose: { type: 'string' },
    guidanceMarkdown: { type: 'string' },
    status: CHAT_ROOM_STATUS_SCHEMA,
    createdBy: NON_EMPTY_STRING_SCHEMA,
    updatedBy: NON_EMPTY_STRING_SCHEMA,
    members: { type: 'array', minItems: 1, items: CHAT_ROOM_INITIAL_MEMBER_SCHEMA },
    bindings: { type: 'array', items: CHAT_ROOM_INITIAL_BINDING_SCHEMA },
  }, ['scopeId', 'slug', 'title']),
  anyOf: [
    { required: ['createdBy'] },
    { required: ['members'] },
  ],
}

const CHAT_ROOM_CREATE_INPUT_SCHEMA: JsonSchema = dataEnvelope(CHAT_ROOM_CREATE_DATA_SCHEMA)

const CHAT_ROOM_UPDATE_INPUT_SCHEMA: JsonSchema = patchEnvelope(objectSchema({
  title: NON_EMPTY_STRING_SCHEMA,
  purpose: { type: 'string' },
  guidanceMarkdown: { type: 'string' },
  updatedBy: NON_EMPTY_STRING_SCHEMA,
}))

const CHAT_ROOM_OPEN_DM_INPUT_SCHEMA: JsonSchema = dataEnvelope(objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  agentIds: {
    type: 'array',
    minItems: 2,
    maxItems: 2,
    items: NON_EMPTY_STRING_SCHEMA,
  },
  projectId: NON_EMPTY_STRING_SCHEMA,
  title: NON_EMPTY_STRING_SCHEMA,
  purpose: { type: 'string' },
  guidanceMarkdown: { type: 'string' },
  roles: STRING_RECORD_SCHEMA,
  createdBy: NON_EMPTY_STRING_SCHEMA,
  updatedBy: NON_EMPTY_STRING_SCHEMA,
}, ['scopeId', 'agentIds']))

const CHAT_ROOM_EXPORT_MANIFEST_INPUT_SCHEMA: JsonSchema = dataEnvelope(objectSchema({
  roomId: NON_EMPTY_STRING_SCHEMA,
  includeMessages: { type: 'boolean' },
}, ['roomId']))

const CHAT_MEMBER_UPDATE_INPUT_SCHEMA: JsonSchema = patchEnvelope(objectSchema({
  roleKey: NON_EMPTY_STRING_SCHEMA,
  brief: { type: 'string' },
  status: CHAT_MEMBER_STATUS_SCHEMA,
  lastReadSeq: { type: 'integer', minimum: 0 },
  updatedBy: NON_EMPTY_STRING_SCHEMA,
}))

const CHAT_MEMBER_REMOVE_INPUT_SCHEMA: JsonSchema = dataEnvelope({
  ...objectSchema({
    memberId: NON_EMPTY_STRING_SCHEMA,
    roomId: NON_EMPTY_STRING_SCHEMA,
    agentId: NON_EMPTY_STRING_SCHEMA,
    updatedBy: NON_EMPTY_STRING_SCHEMA,
  }),
  anyOf: [
    { required: ['memberId'] },
    { required: ['roomId', 'agentId'] },
  ],
})

const CHAT_MESSAGE_SEND_INPUT_SCHEMA: JsonSchema = dataEnvelope(objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  roomId: NON_EMPTY_STRING_SCHEMA,
  authorAgentId: NON_EMPTY_STRING_SCHEMA,
  kind: CHAT_MESSAGE_KIND_SCHEMA,
  text: { type: 'string', minLength: 1 },
  mentions: STRING_ARRAY_SCHEMA,
  replyToSeq: { type: 'integer', minimum: 1 },
  idempotencyKey: NON_EMPTY_STRING_SCHEMA,
  createdBy: NON_EMPTY_STRING_SCHEMA,
}, ['scopeId', 'roomId', 'authorAgentId', 'text']))

const CHAT_MESSAGE_LIST_INPUT_SCHEMA: JsonSchema = objectSchema({
  filter: objectSchema({
    roomId: NON_EMPTY_STRING_SCHEMA,
    scopeId: NON_EMPTY_STRING_SCHEMA,
    authorAgentId: NON_EMPTY_STRING_SCHEMA,
    kind: CHAT_MESSAGE_KIND_SCHEMA,
    idempotencyKey: NON_EMPTY_STRING_SCHEMA,
    afterSeq: { type: 'integer', minimum: 0 },
  }),
  options: DB_OPTIONS_SCHEMA,
})

const CHAT_CATCHUP_INPUT_SCHEMA: JsonSchema = dataEnvelope(objectSchema({
  roomId: NON_EMPTY_STRING_SCHEMA,
  agentId: NON_EMPTY_STRING_SCHEMA,
  limit: { type: 'integer', minimum: 1 },
}, ['agentId']))

const CHAT_MARK_READ_INPUT_SCHEMA: JsonSchema = dataEnvelope(objectSchema({
  roomId: NON_EMPTY_STRING_SCHEMA,
  agentId: NON_EMPTY_STRING_SCHEMA,
  seq: { type: 'integer', minimum: 0 },
  updatedBy: NON_EMPTY_STRING_SCHEMA,
}, ['roomId', 'agentId']))

const MISSION_STATUS_SCHEMA: JsonSchema = { type: 'string', enum: ['draft', 'active', 'completed', 'archived'] }
const MISSION_REF_SCHEMA: JsonSchema = objectSchema({
  refType: NON_EMPTY_STRING_SCHEMA,
  refId: NON_EMPTY_STRING_SCHEMA,
  uri: NON_EMPTY_STRING_SCHEMA,
  title: { type: 'string' },
  note: { type: 'string' },
})

const MISSION_CREATE_DATA_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  slug: NON_EMPTY_STRING_SCHEMA,
  status: MISSION_STATUS_SCHEMA,
  objective: { type: 'string', minLength: 1 },
  taskDefinition: { type: 'string' },
  successCriteria: STRING_ARRAY_SCHEMA,
  constraints: STRING_ARRAY_SCHEMA,
  policy: { type: 'object', additionalProperties: true },
  roles: { type: 'object', additionalProperties: true },
  references: { type: 'array', items: MISSION_REF_SCHEMA },
  visionDocRef: MISSION_REF_SCHEMA,
  activeImplementationPlanRef: MISSION_REF_SCHEMA,
  lineage: objectSchema({ parentMissionId: NON_EMPTY_STRING_SCHEMA }),
  sourceTemplateRef: MISSION_REF_SCHEMA,
  bodyMarkdown: { type: 'string' },
  createdBy: NON_EMPTY_STRING_SCHEMA,
  updatedBy: NON_EMPTY_STRING_SCHEMA,
  meta: { type: 'object', additionalProperties: true },
}, ['scopeId', 'objective'])

const MISSION_PATCH_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  slug: NON_EMPTY_STRING_SCHEMA,
  status: MISSION_STATUS_SCHEMA,
  objective: { type: 'string', minLength: 1 },
  taskDefinition: { type: 'string' },
  successCriteria: STRING_ARRAY_SCHEMA,
  constraints: STRING_ARRAY_SCHEMA,
  policy: { type: 'object', additionalProperties: true },
  roles: { type: 'object', additionalProperties: true },
  references: { type: 'array', items: MISSION_REF_SCHEMA },
  visionDocRef: MISSION_REF_SCHEMA,
  activeImplementationPlanRef: MISSION_REF_SCHEMA,
  lineage: objectSchema({ parentMissionId: NON_EMPTY_STRING_SCHEMA }),
  sourceTemplateRef: MISSION_REF_SCHEMA,
  bodyMarkdown: { type: 'string' },
  createdBy: NON_EMPTY_STRING_SCHEMA,
  updatedBy: NON_EMPTY_STRING_SCHEMA,
  meta: { type: 'object', additionalProperties: true },
})

const MISSION_CREATE_INPUT_SCHEMA: JsonSchema = dataEnvelope(MISSION_CREATE_DATA_SCHEMA)
const MISSION_UPDATE_INPUT_SCHEMA: JsonSchema = patchEnvelope(MISSION_PATCH_SCHEMA)
const MISSION_RESUME_INPUT_SCHEMA: JsonSchema = objectSchema({
  id: NON_EMPTY_STRING_SCHEMA,
  options: objectSchema({
    depth: { type: 'string', enum: ['light', 'standard'] },
    limit: { type: 'integer', minimum: 1 },
  }),
}, ['id'])

const MEMORY_ITEM_KIND_SCHEMA: JsonSchema = {
  type: 'string',
  enum: ['kickoff', 'resume', 'closeout', 'checkpoint', 'decision', 'constraint', 'rule', 'note'],
}
const MEMORY_ITEM_DURABILITY_SCHEMA: JsonSchema = { type: 'string', enum: ['short', 'durable', 'sticky'] }
const MEMORY_ITEM_DATA_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  kind: MEMORY_ITEM_KIND_SCHEMA,
  durability: MEMORY_ITEM_DURABILITY_SCHEMA,
  content: { type: 'string', minLength: 1 },
  tags: STRING_ARRAY_SCHEMA,
  importance: { type: 'integer', minimum: 0 },
  sourceType: NON_EMPTY_STRING_SCHEMA,
  sourceId: NON_EMPTY_STRING_SCHEMA,
  meta: JSON_VALUE_SCHEMA,
  createdAt: NON_EMPTY_STRING_SCHEMA,
  updatedAt: NON_EMPTY_STRING_SCHEMA,
}, ['scopeId', 'kind', 'durability', 'content'])
const MEMORY_ITEM_PATCH_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  kind: MEMORY_ITEM_KIND_SCHEMA,
  durability: MEMORY_ITEM_DURABILITY_SCHEMA,
  content: { type: 'string', minLength: 1 },
  tags: STRING_ARRAY_SCHEMA,
  importance: { type: 'integer', minimum: 0 },
  sourceType: NON_EMPTY_STRING_SCHEMA,
  sourceId: NON_EMPTY_STRING_SCHEMA,
  meta: JSON_VALUE_SCHEMA,
  createdAt: NON_EMPTY_STRING_SCHEMA,
  updatedAt: NON_EMPTY_STRING_SCHEMA,
})
const MEMORY_ITEM_CREATE_INPUT_SCHEMA: JsonSchema = dataEnvelope(MEMORY_ITEM_DATA_SCHEMA)
const MEMORY_ITEM_UPDATE_INPUT_SCHEMA: JsonSchema = patchEnvelope(MEMORY_ITEM_PATCH_SCHEMA)

const AGENT_SESSION_STATUS_SCHEMA: JsonSchema = { type: 'string', enum: ['active', 'ended', 'failed'] }
const AGENT_SESSION_CREATE_DATA_SCHEMA: JsonSchema = objectSchema({
  scopeId: NON_EMPTY_STRING_SCHEMA,
  missionId: NON_EMPTY_STRING_SCHEMA,
  sessionId: NON_EMPTY_STRING_SCHEMA,
  agent: NON_EMPTY_STRING_SCHEMA,
  profile: NON_EMPTY_STRING_SCHEMA,
  model: NON_EMPTY_STRING_SCHEMA,
  status: AGENT_SESSION_STATUS_SCHEMA,
  startedAt: NON_EMPTY_STRING_SCHEMA,
  endedAt: NON_EMPTY_STRING_SCHEMA,
}, ['scopeId', 'sessionId', 'agent'])

const AGENT_SESSION_CREATE_INPUT_SCHEMA: JsonSchema = dataEnvelope(AGENT_SESSION_CREATE_DATA_SCHEMA)

const OBJECT_ARG_NAMES = new Set(['data', 'filter', 'criteria', 'options', 'opts', 'patch'])
const ARRAY_ARG_NAMES = new Set(['ids', 'tags', 'roles'])
const INTEGER_ARG_NAMES = new Set(['seq', 'limit', 'offset', 'tokenInput', 'tokenOutput', 'tokenTotal'])

const inputSchemaByOperationId = new Map<string, JsonSchema>()
const INPUT_SCHEMA_OVERRIDES_BY_OPERATION_ID = new Map<string, JsonSchema>([
  [normalizeAgentspaceOperationId('chat-room.create'), CHAT_ROOM_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat-room.update'), CHAT_ROOM_UPDATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat-room.archive'), idEnvelope({ updatedBy: NON_EMPTY_STRING_SCHEMA })],
  [normalizeAgentspaceOperationId('chat-room.open-dm'), CHAT_ROOM_OPEN_DM_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat-room.export-manifest'), CHAT_ROOM_EXPORT_MANIFEST_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat-member.add'), dataEnvelope(CHAT_MEMBER_CREATE_DATA_SCHEMA)],
  [normalizeAgentspaceOperationId('chat-member.update'), CHAT_MEMBER_UPDATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat-member.remove'), CHAT_MEMBER_REMOVE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat-binding.add'), dataEnvelope(CHAT_BINDING_CREATE_DATA_SCHEMA)],
  [normalizeAgentspaceOperationId('chat-message.send'), CHAT_MESSAGE_SEND_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat-message.list'), CHAT_MESSAGE_LIST_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat.catchup'), CHAT_CATCHUP_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('chat.mark-read'), CHAT_MARK_READ_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('codex-chat-message.add-message'), CODEX_CHAT_MESSAGE_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('codex-chat-message.create'), CODEX_CHAT_MESSAGE_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('codex-chat-thread.add-thread'), CODEX_CHAT_THREAD_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('codex-chat-thread.create'), CODEX_CHAT_THREAD_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('agent-session.create'), AGENT_SESSION_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('agent-session.start-agent-session'), AGENT_SESSION_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('mission.create'), MISSION_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('mission.update'), MISSION_UPDATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('mission.resume'), MISSION_RESUME_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('memory-item.add-memory-item'), MEMORY_ITEM_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('memory-item.create'), MEMORY_ITEM_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('memory-item.update-memory-item'), MEMORY_ITEM_UPDATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('project.create'), PROJECT_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('project-path.create'), PROJECT_PATH_UPSERT_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('project-path.upsert-project-path'), PROJECT_PATH_UPSERT_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('resource.create'), RESOURCE_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('resource.create-resource'), RESOURCE_CREATE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('skill.ask'), SKILL_DISCOVERY_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('skill.search'), SKILL_DISCOVERY_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('official-catalog.inspect'), OFFICIAL_CATALOG_INSPECT_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('official-catalog.reconcile'), OFFICIAL_CATALOG_RECONCILE_INPUT_SCHEMA],
  [normalizeAgentspaceOperationId('official-catalog.rollback'), OFFICIAL_CATALOG_ROLLBACK_INPUT_SCHEMA],
])

const OUTPUT_SCHEMA_OVERRIDES_BY_OPERATION_ID = new Map<string, JsonSchema>([
  [normalizeAgentspaceOperationId('skill.ask'), SKILL_ASK_OUTPUT_SCHEMA],
  [normalizeAgentspaceOperationId('skill.search'), SKILL_SEARCH_OUTPUT_SCHEMA],
  [normalizeAgentspaceOperationId('skill-version.export-skill-package'), SKILL_PACKAGE_EXPORT_OUTPUT_SCHEMA],
  [normalizeAgentspaceOperationId('official-catalog.inspect'), OFFICIAL_CATALOG_SNAPSHOT_SCHEMA],
  [normalizeAgentspaceOperationId('official-catalog.reconcile'), OFFICIAL_CATALOG_RECEIPT_SCHEMA],
  [normalizeAgentspaceOperationId('official-catalog.rollback'), OFFICIAL_CATALOG_RECEIPT_SCHEMA],
])

function inferOperationKind(operationId: string): AgentspaceOperationKind {
  const segments = operationId.split('.').map((segment) => segment.trim()).filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  if (CRUD_KINDS.has(last as Exclude<AgentspaceOperationKind, 'custom'>)) {
    return last as Exclude<AgentspaceOperationKind, 'custom'>
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

function getDefaultSchemaForKind(kind: AgentspaceOperationKind, direction: SchemaDirection): JsonSchema {
  if (kind === 'list' && direction === 'input') return GENERIC_LIST_INPUT_SCHEMA
  if (kind === 'list' && direction === 'output') return GENERIC_LIST_OUTPUT_SCHEMA

  if (kind === 'get' && direction === 'input') return GENERIC_GET_INPUT_SCHEMA
  if (kind === 'get' && direction === 'output') return GENERIC_GET_OUTPUT_SCHEMA

  if (kind === 'create' && direction === 'input') return GENERIC_CREATE_INPUT_SCHEMA
  if (kind === 'create' && direction === 'output') return GENERIC_OBJECT_OUTPUT_SCHEMA

  if (kind === 'update' && direction === 'input') return GENERIC_UPDATE_INPUT_SCHEMA
  if (kind === 'update' && direction === 'output') return GENERIC_OBJECT_OUTPUT_SCHEMA

  if (kind === 'delete' && direction === 'input') return GENERIC_DELETE_INPUT_SCHEMA
  if (kind === 'delete' && direction === 'output') return GENERIC_VOID_OUTPUT_SCHEMA

  if (direction === 'input') return GENERIC_CUSTOM_INPUT_SCHEMA
  return GENERIC_CUSTOM_OUTPUT_SCHEMA
}

function inferArgumentSchema(name: string): JsonSchema {
  const normalized = String(name ?? '').trim()
  const lowered = normalized.toLowerCase()

  if (!normalized) return GENERIC_FLEXIBLE_FIELD_SCHEMA
  if (OBJECT_ARG_NAMES.has(normalized)) return { type: 'object', additionalProperties: true }
  if (ARRAY_ARG_NAMES.has(normalized)) return { type: 'array', items: GENERIC_FLEXIBLE_FIELD_SCHEMA }
  if (INTEGER_ARG_NAMES.has(normalized)) return { type: 'integer' }
  if (lowered === 'id' || lowered.endsWith('id') || lowered.endsWith('uid')) return { type: 'string', minLength: 1 }
  if (lowered.endsWith('at') || lowered.includes('date') || lowered.includes('time')) return { type: 'string', minLength: 1 }
  if (lowered.includes('enabled') || lowered.startsWith('is') || lowered.startsWith('has')) return { type: 'boolean' }
  if (lowered.includes('count') || lowered.includes('index') || lowered.endsWith('size')) return { type: 'integer' }
  if (lowered.includes('path') || lowered.includes('slug') || lowered.includes('name') || lowered.includes('title')) {
    return { type: 'string', minLength: 1 }
  }

  return GENERIC_FLEXIBLE_FIELD_SCHEMA
}

function buildInputSchemaFromCatalog(operationId: string): JsonSchema | null {
  const normalizedOperationId = normalizeAgentspaceOperationId(operationId)
  const cached = inputSchemaByOperationId.get(normalizedOperationId)
  if (cached) return cached

  const override = INPUT_SCHEMA_OVERRIDES_BY_OPERATION_ID.get(normalizedOperationId)
  if (override) {
    inputSchemaByOperationId.set(normalizedOperationId, override)
    return override
  }

  const row = AGENTSPACE_OPERATION_CATALOG_ROWS.find((item) => normalizeAgentspaceOperationId(item.operationId) === normalizedOperationId)
  if (!row) return null

  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const arg of row.args) {
    properties[arg.name] = inferArgumentSchema(arg.name)
    if (!arg.optional) required.push(arg.name)
  }

  const schema: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    properties,
  }

  if (required.length > 0) {
    ;(schema as Record<string, unknown>).required = required
  }

  inputSchemaByOperationId.set(normalizedOperationId, schema)
  return schema
}

export function createAgentspaceSchemaRef(name: string): AgentspaceOperationSchemaRef {
  return { $ref: normalizeAgentspaceSchemaRefName(name) }
}

export function normalizeAgentspaceSchemaRefName(name: string): string {
  return normalizeAgentspaceOperationId(name).replace(/\.-/g, '.')
}

export function resolveAgentspaceSchemaRefName(schema: unknown): string | null {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null
  const maybeRef = (schema as { $ref?: unknown }).$ref
  if (typeof maybeRef !== 'string') return null
  const normalized = maybeRef.trim()
  return normalized.length > 0 ? normalized : null
}

export function getAgentspaceOperationIoSchemaRefs(operationId: string): { inputRef: string; outputRef: string } {
  return buildDefaultSchemaRefs(normalizeAgentspaceOperationId(operationId))
}

/**
 * Return a Zod schema for the operation's input contract. agentspace authors
 * its tool inputs as native JSON Schemas (driven by Ajv); we wrap each one in
 * `z.unknown().meta(jsonSchema)` so consumers stay on the same Zod-shaped
 * accessor pattern as the rest of the kits (`getXToolInputSchema(op)`), and
 * `z.toJSONSchema(...)` round-trips the original JSON Schema verbatim.
 */
export function getAgentspaceToolInputSchema(operationId: string): z.ZodType<unknown> | undefined {
  const normalizedOperationId = normalizeAgentspaceOperationId(operationId)
  const refs = buildDefaultSchemaRefs(normalizedOperationId)
  if (!refs.inputRef) return undefined
  const jsonSchema = getAgentspaceContractSchema(refs.inputRef)
  if (!jsonSchema) return undefined
  return z.unknown().meta(jsonSchema as Record<string, unknown>)
}

export function getAgentspaceContractSchema(ref: string): JsonSchema | null {
  const parsed = parseSchemaRef(ref)
  if (!parsed) return null

  const normalizedOperationId = normalizeAgentspaceOperationId(parsed.operationId)
  if (parsed.direction === 'input') {
    const inputSchema = buildInputSchemaFromCatalog(normalizedOperationId)
    if (inputSchema) return inputSchema
  }

  const outputOverride = OUTPUT_SCHEMA_OVERRIDES_BY_OPERATION_ID.get(normalizedOperationId)
  if (parsed.direction === 'output' && outputOverride) return outputOverride

  const kind = inferOperationKind(normalizedOperationId)
  return getDefaultSchemaForKind(kind, parsed.direction)
}

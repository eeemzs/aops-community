import type { AgentspaceOperationContract, AgentspaceOperationSideEffect } from './contract.js'
import type { AgentspaceOperationPolicy } from './types.js'
import { listAgentspaceOperationContracts } from './contract.js'
import { getAgentspaceContractSchema, resolveAgentspaceSchemaRefName } from './schemas.js'
import { normalizeAgentspaceOperationId } from './definition.js'

export type AgentspaceDomainCapabilityOperation = {
  operationId: string
  title?: string
  sideEffect?: AgentspaceOperationSideEffect
  tags?: string[]
  inputSchemaRef?: string
  outputSchemaRef?: string
}

export type AgentspaceDomainCapabilityOperationDocs = {
  summary?: string
  notes?: string[]
  examples?: string[]
}

export type AgentspaceDomainCapabilityResource = {
  resourceId: string
  title: string
  kind?: string
}

export type AgentspaceDomainDiscoveryDocs = {
  summary?: string
  notes?: string[]
}

export type AgentspaceDomainCapabilityManifest = {
  manifestVersion: string
  domain: {
    id: string
    version: string
    displayName?: string
    description?: string
  }
  capabilities: {
    operations: AgentspaceDomainCapabilityOperation[]
    resources?: AgentspaceDomainCapabilityResource[]
  }
  contracts?: {
    schemas: Record<string, unknown>
  }
  policies?: {
    operations: Record<string, AgentspaceOperationPolicy>
  }
  docs?: {
    domain?: AgentspaceDomainDiscoveryDocs
    resources?: Record<string, AgentspaceDomainDiscoveryDocs>
    operations?: Record<string, AgentspaceDomainCapabilityOperationDocs>
  }
}

export type BuildAgentspaceDomainCapabilityManifestOptions = {
  manifestVersion?: string
  domainVersion?: string
  includeDocs?: boolean
  refresh?: boolean
}

const OPERATION_DOCS_OVERRIDES = new Map<string, AgentspaceDomainCapabilityOperationDocs>([
  [
    normalizeAgentspaceOperationId('playbook.list'),
    {
      summary: 'List hosted read-only playbook projections backed by Agentspace memory rules and constraints.',
      notes: [
        'This is a read projection over Agentspace memory items with kind=rule|constraint and playbook tags/meta.',
        'Playbook authoring authority remains Agentspace memory; v1 does not introduce a dedicated playbook table.',
        'Experience can be promoted into playbooks through the CLI promote flow, then synced as ordinary memory items.',
      ],
    },
  ],
  [
    normalizeAgentspaceOperationId('skill-version.import-skill-package'),
    {
      summary: 'Import a canonical filesystem skill package into skill and skill-version records.',
      notes: [
        'Use the custom input envelope: {"data":{...}}.',
        'data.bundle.files must include SKILL.md as the canonical entry file.',
        'projectId carries hosted context; scopeId is the canonical owner for scoped imports.',
        'For project-scoped imports, provide scopeId consistently with scopeType=project.',
      ],
    },
  ],
  [
    normalizeAgentspaceOperationId('skill-version.export-skill-package'),
    {
      summary: 'Export a canonical filesystem skill package from a skill version.',
      notes: [
        'Returns the canonical filesystem package rooted at SKILL.md.',
        'Export output is intended to round-trip back into import-skill-package without compatibility shims.',
      ],
    },
  ],
  [
    normalizeAgentspaceOperationId('skill-version.materialize-skill-package'),
    {
      summary: 'Materialize a canonical filesystem skill package to an output directory.',
      notes: [
        'Use the custom input envelope: {"id":"<skill-version-id>","data":{...}}.',
        'data.outputDir is required; set overwrite=true to replace an existing materialized package.',
      ],
    },
  ],
])

function humanizeResource(resource: string): string {
  const normalized = resource
    .replace(/^aops\./, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function inferResourceKind(resourceId: string): string | undefined {
  if (resourceId.includes('link') || resourceId.includes('member')) return 'relationship'
  if (resourceId.includes('version')) return 'versioned-record'
  if (resourceId.includes('thread') || resourceId.includes('message') || resourceId.includes('memory')) return 'conversation-state'
  return 'record'
}

function buildResourceSummary(resourceTitle: string, operationKinds: string[]): string {
  if (operationKinds.length === 0) {
    return `${resourceTitle} records used inside the Agentspace project runtime.`
  }
  if (operationKinds.length === 1) {
    return `Supports ${operationKinds[0]} operations for ${resourceTitle.toLowerCase()} in Agentspace runtime workflows.`
  }
  return `Supports ${operationKinds.slice(0, 5).join(', ')} operations for ${resourceTitle.toLowerCase()} in Agentspace runtime workflows.`
}

function buildCapabilityResources(operations: AgentspaceOperationContract[]): AgentspaceDomainCapabilityResource[] {
  const seen = new Map<string, AgentspaceDomainCapabilityResource>()

  for (const operation of operations) {
    const resourceId = String(operation.serviceEntity ?? '').trim()
    if (!resourceId || seen.has(resourceId)) continue
    seen.set(resourceId, {
      resourceId,
      title: humanizeResource(resourceId),
      kind: inferResourceKind(resourceId),
    })
  }

  return [...seen.values()].sort((left, right) => left.title.localeCompare(right.title))
}

function buildResourceDocs(operations: AgentspaceOperationContract[]): Record<string, AgentspaceDomainDiscoveryDocs> {
  const operationKindsByResource = new Map<string, Set<string>>()

  for (const operation of operations) {
    const resourceId = String(operation.serviceEntity ?? '').trim()
    if (!resourceId) continue
    const existing = operationKindsByResource.get(resourceId) ?? new Set<string>()
    existing.add(operation.kind)
    operationKindsByResource.set(resourceId, existing)
  }

  return Object.fromEntries(
    [...operationKindsByResource.entries()]
      .sort(([left], [right]) => humanizeResource(left).localeCompare(humanizeResource(right)))
      .map(([resourceId, operationKinds]) => [
        resourceId,
        {
          summary: buildResourceSummary(humanizeResource(resourceId), [...operationKinds]),
        },
      ]),
  )
}

function chooseOperationSummary(operation: AgentspaceOperationContract): string {
  const resource = humanizeResource(operation.serviceEntity || operation.operationId.split('.')[0] || 'resource')
  const kind = operation.kind

  if (kind === 'list') return `List ${resource} records.`
  if (kind === 'get') return `Get a ${resource} record.`
  if (kind === 'create') return `Create a ${resource} record.`
  if (kind === 'update') return `Update a ${resource} record.`
  if (kind === 'delete') return `Delete a ${resource} record.`
  return `Run ${operation.operationId} on ${resource}.`
}

function toTags(operation: AgentspaceOperationContract): string[] {
  const tags = new Set<string>()
  for (const tag of operation.tags ?? []) {
    const normalized = String(tag ?? '').trim()
    if (!normalized) continue
    tags.add(normalized)
  }
  tags.add(`kind:${operation.kind}`)
  tags.add(`resource:${operation.serviceEntity}`)
  tags.add(`service:${operation.serviceKey}`)
  return [...tags]
}

function toOperationDocs(operation: AgentspaceOperationContract): AgentspaceDomainCapabilityOperationDocs {
  const requiredArgs = operation.args.filter((arg) => !arg.optional).map((arg) => arg.name)
  const optionalArgs = operation.args.filter((arg) => arg.optional).map((arg) => arg.name)
  const notes: string[] = []

  if (requiredArgs.length > 0) notes.push(`required args: ${requiredArgs.join(', ')}`)
  if (optionalArgs.length > 0) notes.push(`optional args: ${optionalArgs.join(', ')}`)

  const baseDocs: AgentspaceDomainCapabilityOperationDocs = {
    summary: operation.summary ?? chooseOperationSummary(operation),
    ...(notes.length > 0 ? { notes } : {}),
    ...(operation.examples && operation.examples.length > 0 ? { examples: [...operation.examples] } : {}),
  }
  const override = OPERATION_DOCS_OVERRIDES.get(normalizeAgentspaceOperationId(operation.operationId))
  if (!override) return baseDocs

  const mergedNotes = [...(baseDocs.notes ?? []), ...(override.notes ?? [])]
  const mergedExamples = override.examples ?? baseDocs.examples

  return {
    summary: override.summary ?? baseDocs.summary,
    ...(mergedNotes.length > 0 ? { notes: mergedNotes } : {}),
    ...(mergedExamples && mergedExamples.length > 0 ? { examples: mergedExamples } : {}),
  }
}

function toCapabilityOperation(operation: AgentspaceOperationContract): AgentspaceDomainCapabilityOperation {
  const inputSchemaRef = resolveAgentspaceSchemaRefName(operation.inputSchema)
  const outputSchemaRef = resolveAgentspaceSchemaRefName(operation.outputSchema)

  return {
    operationId: operation.operationId,
    title: operation.summary,
    sideEffect: operation.sideEffect,
    tags: toTags(operation),
    ...(inputSchemaRef ? { inputSchemaRef } : {}),
    ...(outputSchemaRef ? { outputSchemaRef } : {}),
  }
}

export function buildAgentspaceDomainCapabilityManifest(
  options: BuildAgentspaceDomainCapabilityManifestOptions = {},
): AgentspaceDomainCapabilityManifest {
  const operations = listAgentspaceOperationContracts({ refresh: options.refresh })

  const manifest: AgentspaceDomainCapabilityManifest = {
    manifestVersion: options.manifestVersion ?? '1.0.0',
    domain: {
      id: 'agentspace',
      version: options.domainVersion ?? '0.0.0',
      displayName: 'Agentspace',
      description: 'Context and runtime domain for projects, prompts, skills, memory, chat, artifacts, agent runs, and related runtime records.',
    },
    capabilities: {
      operations: operations.map(toCapabilityOperation),
      resources: buildCapabilityResources(operations),
    },
  }

  if (options.includeDocs !== false) {
    manifest.docs = {
      domain: {
        summary: 'Manage Agentspace context state such as projects, prompts, skills, chat threads, memory items, artifacts, agent runs, and related runtime records.',
        notes: [
          'Canonical skill package standard: aops-skill-package-v1.',
          'Canonical package entry file: SKILL.md.',
          'If manifests or projections look stale after a domain change, run `pnpm run manifest:sync`, then `aops-cli host diagnostics --reset --warmup`, then `aops-cli agent tools --domain agentspace --project-id <project-id>`.',
        ],
      },
      resources: buildResourceDocs(operations),
      operations: Object.fromEntries(operations.map((operation) => [operation.operationId, toOperationDocs(operation)])),
    }
  }

  const operationPolicies: Record<string, AgentspaceOperationPolicy> = {}
  for (const operation of operations) {
    if (!operation.policy) continue
    operationPolicies[operation.operationId] = operation.policy
  }
  if (Object.keys(operationPolicies).length > 0) {
    manifest.policies = { operations: operationPolicies }
  }

  const schemaRefs = new Set<string>()
  for (const operation of manifest.capabilities.operations) {
    if (operation.inputSchemaRef) schemaRefs.add(operation.inputSchemaRef)
    if (operation.outputSchemaRef) schemaRefs.add(operation.outputSchemaRef)
  }

  if (schemaRefs.size > 0) {
    const schemas: Record<string, unknown> = {}
    for (const ref of schemaRefs) {
      const schema = getAgentspaceContractSchema(ref)
      if (!schema) continue
      schemas[ref] = schema
    }
    if (Object.keys(schemas).length > 0) {
      manifest.contracts = { schemas }
    }
  }

  return manifest
}

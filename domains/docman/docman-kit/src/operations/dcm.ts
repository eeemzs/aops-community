import type { DocmanOperationContract, DocmanOperationSideEffect } from './contract.js'
import type { DocmanOperationPolicy } from './types.js'
import { listDocmanOperationContracts } from './contract.js'
import { getDocmanContractSchema, resolveDocmanSchemaRefName } from './schemas.js'

export type DocmanDomainCapabilityOperation = {
  operationId: string
  title?: string
  sideEffect?: DocmanOperationSideEffect
  tags?: string[]
  inputSchemaRef?: string
  outputSchemaRef?: string
}

export type DocmanDomainCapabilityOperationDocs = {
  summary?: string
  notes?: string[]
  examples?: string[]
  antiPatterns?: string[]
  preconditions?: string[]
  postconditions?: string[]
}

export type DocmanDomainCapabilityResource = {
  resourceId: string
  title: string
  kind?: string
}

export type DocmanDomainDiscoveryDocs = {
  summary?: string
  notes?: string[]
}

export type DocmanDomainCapabilityManifest = {
  manifestVersion: string
  domain: {
    id: string
    version: string
    displayName?: string
    description?: string
  }
  capabilities: {
    operations: DocmanDomainCapabilityOperation[]
    resources?: DocmanDomainCapabilityResource[]
  }
  contracts?: {
    schemas: Record<string, unknown>
  }
  policies?: {
    operations: Record<string, DocmanOperationPolicy>
  }
  docs?: {
    domain?: DocmanDomainDiscoveryDocs
    resources?: Record<string, DocmanDomainDiscoveryDocs>
    operations?: Record<string, DocmanDomainCapabilityOperationDocs>
  }
}

export type BuildDocmanDomainCapabilityManifestOptions = {
  manifestVersion?: string
  domainVersion?: string
  includeDocs?: boolean
  refresh?: boolean
}

function toTags(operation: DocmanOperationContract): string[] {
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

function humanizeResource(resource: string): string {
  const label = resource
    .replace(/^docman\./, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!label) return 'Resource'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function inferResourceKind(resourceId: string): string | undefined {
  if (resourceId.includes('link')) return 'relationship'
  if (resourceId.includes('version')) return 'versioned-record'
  if (resourceId.includes('asset') || resourceId.includes('snippet') || resourceId.includes('embed')) return 'content-asset'
  return 'document-record'
}

function buildResourceSummary(resourceTitle: string, operationKinds: string[]): string {
  if (operationKinds.length === 0) {
    return `${resourceTitle} records used to compose, version, and render documentation content.`
  }
  if (operationKinds.length === 1) {
    return `Supports ${operationKinds[0]} operations for ${resourceTitle.toLowerCase()} in documentation workflows.`
  }
  return `Supports ${operationKinds.slice(0, 5).join(', ')} operations for ${resourceTitle.toLowerCase()} in documentation workflows.`
}

function buildCapabilityResources(operations: DocmanOperationContract[]): DocmanDomainCapabilityResource[] {
  const seen = new Map<string, DocmanDomainCapabilityResource>()

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

function buildResourceDocs(operations: DocmanOperationContract[]): Record<string, DocmanDomainDiscoveryDocs> {
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

function toOperationDocs(operation: DocmanOperationContract): DocmanDomainCapabilityOperationDocs {
  const requiredArgs = operation.args.filter((arg) => !arg.optional).map((arg) => arg.name)
  const optionalArgs = operation.args.filter((arg) => arg.optional).map((arg) => arg.name)
  const notes: string[] = [...(operation.notes ?? [])]

  if (requiredArgs.length > 0) notes.push(`required args: ${requiredArgs.join(', ')}`)
  if (optionalArgs.length > 0) notes.push(`optional args: ${optionalArgs.join(', ')}`)

  return {
    summary: operation.summary,
    ...(notes.length > 0 ? { notes } : {}),
    ...(operation.examples && operation.examples.length > 0 ? { examples: [...operation.examples] } : {}),
    ...(operation.antiPatterns && operation.antiPatterns.length > 0 ? { antiPatterns: [...operation.antiPatterns] } : {}),
    ...(operation.preconditions && operation.preconditions.length > 0 ? { preconditions: [...operation.preconditions] } : {}),
    ...(operation.postconditions && operation.postconditions.length > 0 ? { postconditions: [...operation.postconditions] } : {}),
  }
}

function toCapabilityOperation(operation: DocmanOperationContract): DocmanDomainCapabilityOperation {
  const inputSchemaRef = resolveDocmanSchemaRefName(operation.inputSchema)
  const outputSchemaRef = resolveDocmanSchemaRefName(operation.outputSchema)

  return {
    operationId: operation.operationId,
    title: operation.summary,
    sideEffect: operation.sideEffect,
    tags: toTags(operation),
    ...(inputSchemaRef ? { inputSchemaRef } : {}),
    ...(outputSchemaRef ? { outputSchemaRef } : {}),
  }
}

export function buildDocmanDomainCapabilityManifest(
  options: BuildDocmanDomainCapabilityManifestOptions = {},
): DocmanDomainCapabilityManifest {
  const operations = listDocmanOperationContracts({ refresh: options.refresh })

  const manifest: DocmanDomainCapabilityManifest = {
    manifestVersion: options.manifestVersion ?? '1.0.0',
    domain: {
      id: 'docman',
      version: options.domainVersion ?? '0.0.0',
      displayName: 'Docman',
      description: 'Document composition and content-structure tooling for documents, sections, pages, snippets, assets, embeds, and version history.',
    },
    capabilities: {
      operations: operations.map(toCapabilityOperation),
      resources: buildCapabilityResources(operations),
    },
  }

  if (options.includeDocs !== false) {
    manifest.docs = {
      domain: {
        summary: 'Create, organize, version, render, and link documentation content across documents, sections, pages, snippets, assets, embeds, and structure links.',
        notes: [
          'page-version.format accepts md and mdx as native source formats',
          'native compose/fetch accepts md and mdx source today',
          'publish materialize currently returns deterministic markdown or html text payloads',
          'publish target dispatch is registry-backed internally; future artifact exporters remain a separate contract track',
          'asset:// logical references in md/mdx source resolve through asset and asset-version ownership during compose',
          'asset and asset-version now provide the publish-grade ownership foundation for images and attached resources',
          'embed records remain the lightweight placement/render-hint layer that can later bind to asset ownership',
        ],
      },
      resources: buildResourceDocs(operations),
      operations: Object.fromEntries(
        operations.map((operation) => [operation.operationId, toOperationDocs(operation)]),
      ),
    }
  }

  const operationPolicies: Record<string, DocmanOperationPolicy> = {}
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
      const schema = getDocmanContractSchema(ref)
      if (!schema) continue
      schemas[ref] = schema
    }
    if (Object.keys(schemas).length > 0) {
      manifest.contracts = { schemas }
    }
  }

  return manifest
}

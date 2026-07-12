import type { SysOperationContract, SysOperationSideEffect } from './contract.js'
import type { SysOperationPolicy } from './types.js'
import { listSysOperationContracts } from './contract.js'
import { getSysContractSchema, resolveSysSchemaRefName } from './schemas.js'

export type SysDomainCapabilityOperation = {
  operationId: string
  title?: string
  sideEffect?: SysOperationSideEffect
  tags?: string[]
  inputSchemaRef?: string
  outputSchemaRef?: string
}

export type SysDomainCapabilityOperationDocs = {
  summary?: string
  notes?: string[]
  examples?: string[]
}

export type SysDomainCapabilityResource = {
  resourceId: string
  title: string
  kind?: string
}

export type SysDomainDiscoveryDocs = {
  summary?: string
  notes?: string[]
}

export type SysDomainCapabilityManifest = {
  manifestVersion: string
  domain: {
    id: string
    version: string
    displayName?: string
    description?: string
  }
  capabilities: {
    operations: SysDomainCapabilityOperation[]
    resources?: SysDomainCapabilityResource[]
  }
  contracts?: {
    schemas: Record<string, unknown>
  }
  policies?: {
    operations: Record<string, SysOperationPolicy>
  }
  docs?: {
    domain?: SysDomainDiscoveryDocs
    resources?: Record<string, SysDomainDiscoveryDocs>
    operations?: Record<string, SysDomainCapabilityOperationDocs>
  }
}

export type BuildSysDomainCapabilityManifestOptions = {
  manifestVersion?: string
  domainVersion?: string
  includeDocs?: boolean
  refresh?: boolean
}

function toTags(operation: SysOperationContract): string[] {
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
    .replace(/^sys\./, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!label) return 'Resource'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function inferResourceKind(resourceId: string): string | undefined {
  if (resourceId.includes('event')) return 'event-log'
  if (resourceId.includes('rate')) return 'policy'
  return 'record'
}

function buildResourceSummary(resourceTitle: string, operationKinds: string[]): string {
  if (operationKinds.length === 0) {
    return `${resourceTitle} records used for system-level storage and throttling concerns.`
  }
  if (operationKinds.length === 1) {
    return `Supports ${operationKinds[0]} operations for ${resourceTitle.toLowerCase()} in system administration workflows.`
  }
  return `Supports ${operationKinds.slice(0, 5).join(', ')} operations for ${resourceTitle.toLowerCase()} in system administration workflows.`
}

function buildCapabilityResources(operations: SysOperationContract[]): SysDomainCapabilityResource[] {
  const seen = new Map<string, SysDomainCapabilityResource>()

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

function buildResourceDocs(operations: SysOperationContract[]): Record<string, SysDomainDiscoveryDocs> {
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

function toOperationDocs(operation: SysOperationContract): SysDomainCapabilityOperationDocs {
  const requiredArgs = operation.args.filter((arg) => !arg.optional).map((arg) => arg.name)
  const optionalArgs = operation.args.filter((arg) => arg.optional).map((arg) => arg.name)
  const notes: string[] = []

  if (requiredArgs.length > 0) notes.push(`required args: ${requiredArgs.join(', ')}`)
  if (optionalArgs.length > 0) notes.push(`optional args: ${optionalArgs.join(', ')}`)

  return {
    summary: operation.summary,
    ...(notes.length > 0 ? { notes } : {}),
    ...(operation.examples && operation.examples.length > 0 ? { examples: [...operation.examples] } : {}),
  }
}

function toCapabilityOperation(operation: SysOperationContract): SysDomainCapabilityOperation {
  const inputSchemaRef = resolveSysSchemaRefName(operation.inputSchema)
  const outputSchemaRef = resolveSysSchemaRefName(operation.outputSchema)

  return {
    operationId: operation.operationId,
    title: operation.summary,
    sideEffect: operation.sideEffect,
    tags: toTags(operation),
    ...(inputSchemaRef ? { inputSchemaRef } : {}),
    ...(outputSchemaRef ? { outputSchemaRef } : {}),
  }
}

export function buildSysDomainCapabilityManifest(
  options: BuildSysDomainCapabilityManifestOptions = {},
): SysDomainCapabilityManifest {
  const operations = listSysOperationContracts({ refresh: options.refresh })

  const manifest: SysDomainCapabilityManifest = {
    manifestVersion: options.manifestVersion ?? '1.0.0',
    domain: {
      id: 'sys',
      version: options.domainVersion ?? '0.0.0',
      displayName: 'Sys',
      description: 'System-oriented tooling for event storage, rate limiting, and other operational control-plane records.',
    },
    capabilities: {
      operations: operations.map(toCapabilityOperation),
      resources: buildCapabilityResources(operations),
    },
  }

  if (options.includeDocs !== false) {
    manifest.docs = {
      domain: {
        summary: 'Inspect and manage operational system records such as event stores and rate limiters.',
        notes: ['These tools are typically operational or administrative and should not be treated as general business-domain CRUD.'],
      },
      resources: buildResourceDocs(operations),
      operations: Object.fromEntries(operations.map((operation) => [operation.operationId, toOperationDocs(operation)])),
    }
  }

  const operationPolicies: Record<string, SysOperationPolicy> = {}
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
      const schema = getSysContractSchema(ref)
      if (!schema) continue
      schemas[ref] = schema
    }
    if (Object.keys(schemas).length > 0) {
      manifest.contracts = { schemas }
    }
  }

  return manifest
}

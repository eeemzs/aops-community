import {
  buildAgentspaceDomainCapabilityManifest as buildAgentspaceDomainCapabilityManifestInternal,
  buildAgentspaceHostRouteProjection as buildAgentspaceHostRouteProjectionInternal,
} from './operations/index.js'
import {
  getAgentspaceOperationById as getAgentspaceOperationByIdInternal,
  getAgentspaceOperationByToolId as getAgentspaceOperationByToolIdInternal,
  listAgentspaceOperationSpecs as listAgentspaceOperationSpecsInternal,
} from './operations/catalog.js'
import {
  runAgentspaceKitOperationByToolId as runAgentspaceKitOperationByToolIdInternal,
  runAgentspaceKitOperationByTypedId as runAgentspaceKitOperationByTypedIdInternal,
} from './operations/executor.js'
import type { AgentspaceOperationInput, AgentspaceOperationOutput, AgentspaceTypedOperationId } from './operations/index.js'
import type { AgentspaceDomainCapabilityManifest } from './operations/dcm.js'
import type { AgentspaceHostRouteProjectionEntry } from './operations/host-projection.js'
import type { AgentspaceOperationSpec } from './operations/types.js'

export * from './domain-services/index.js'
export * from './domain-services/unified.js'
export * from './domain-services/provider.js'
export * from './domain-services/types.js'
export * from './domain-services/presets.js'
export * from './domain-services/resilience.js'
export * from './domain-services/metrics.js'
export * from './domain-services/jwt.js'
export * from './config/config.js'
export * from './calls/index.js'
export * from './errors/index.js'
export * from './resources/index.js'
export * from './operations/index.js'
export * from './shared/index.js'

export const AGENTSPACE_KIT_DOMAIN_ID = 'agentspace' as const

export type AgentspaceKitOperationSpec = AgentspaceOperationSpec
export type AgentspaceKitOperationId = AgentspaceOperationSpec['operationId']

function normalizeAgentspaceToolId(toolId: string): string {
  return String(toolId ?? '').trim().toLowerCase()
}

export function listAgentspaceKitOperations(
  options?: { refresh?: boolean },
): readonly AgentspaceKitOperationSpec[] {
  return listAgentspaceOperationSpecsInternal(options)
}

export function getAgentspaceKitOperationByTypedId(
  operationId: string,
  options?: { refresh?: boolean },
): AgentspaceKitOperationSpec | null {
  return getAgentspaceOperationByIdInternal(operationId, options)
}

export function getAgentspaceKitOperationByToolId(
  toolId: string,
  options?: { refresh?: boolean },
): AgentspaceKitOperationSpec | null {
  return getAgentspaceOperationByToolIdInternal(normalizeAgentspaceToolId(toolId), options)
}

export async function runAgentspaceKitOperationByToolId(
  toolId: string,
  input: unknown,
): Promise<unknown> {
  return runAgentspaceKitOperationByToolIdInternal(normalizeAgentspaceToolId(toolId), input)
}

export async function runAgentspaceKitOperationByTypedId<TId extends AgentspaceTypedOperationId>(
  operationId: TId,
  input: AgentspaceOperationInput<TId>,
): Promise<AgentspaceOperationOutput<TId>> {
  return runAgentspaceKitOperationByTypedIdInternal(operationId, input)
}

export function buildAgentspaceDomainCapabilityManifest(options?: {
  manifestVersion?: string
  domainVersion?: string
  includeDocs?: boolean
  refresh?: boolean
}): AgentspaceDomainCapabilityManifest {
  return buildAgentspaceDomainCapabilityManifestInternal(options)
}

export function buildAgentspaceHostRouteProjection(options?: {
  refresh?: boolean
}): AgentspaceHostRouteProjectionEntry[] {
  return buildAgentspaceHostRouteProjectionInternal(options)
}

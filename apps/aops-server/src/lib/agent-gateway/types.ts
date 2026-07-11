import type { DomainPluginRegistry, DomainRouteManifestEntry, HostRequestContext } from '@aopslab/host-core'
import type {
  FederatedCatalogSource,
  FederatedCatalogTool,
  FederatedCatalogToolSource,
  FederatedToolCatalog,
  Manifest,
} from '@aopslab/manifest'

import type {
  HostAgentGatewayConfig,
  HostAgentGatewayManifestProviderConfig,
  HostAgentGatewayRemoteDomainSourceConfig,
} from '$lib/host-config'

export type RouteSummaryEntry = {
  id: string
  method: string
  pattern: string
  operation: string
  summary?: string
}

export type AgentGatewayToolDescriptor = FederatedCatalogTool

export type AgentGatewayOperationDocs = {
  summary?: string
  notes?: string[]
  examples?: string[]
  antiPatterns?: string[]
  preconditions?: string[]
  postconditions?: string[]
}

export type AgentGatewayDomainDocs = {
  summary?: string
  notes?: string[]
}

export type AgentGatewayDomainResourceDescriptor = {
  resourceId: string
  title: string
  kind?: string
  schemaRef?: string
  summary?: string
  notes?: string[]
}

export type AgentGatewayDomainMetadata = {
  domain: string
  displayName?: string
  description?: string
  summary?: string
  notes?: string[]
  resources?: AgentGatewayDomainResourceDescriptor[]
}

export type AgentGatewaySourceError = {
  sourceId: string
  error: string
}

export type AgentGatewayListResult = {
  catalogVersion: string
  generatedAt: string
  tools: AgentGatewayToolDescriptor[]
  errors: AgentGatewaySourceError[]
  operationDocsByOperationId?: Record<string, AgentGatewayOperationDocs>
  domainMetadataByDomain?: Record<string, AgentGatewayDomainMetadata>
}

export type AgentGatewayInvokeArgs = {
  toolId: string
  sourceId?: string
  input?: unknown
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
  context?: HostRequestContext
}

export type AgentGatewayInvokeResult = {
  tool: AgentGatewayToolDescriptor & {
    sourceId: string
    sourceKind: FederatedCatalogToolSource['kind']
    sourceBaseUrl?: string
    sourceApiBasePath?: string
  }
  status: number
  data: unknown
  headers?: Record<string, string>
}

export type AgentGatewayOpenApiArgs = {
  domain?: string
  serverBaseUrl?: string
}

export type CreateAgentGatewayOptions = {
  registryResolver: () => Promise<DomainPluginRegistry>
  registryResetter?: () => void
  config?: HostAgentGatewayConfig
  configPath?: string
}

export type RouteInvokeInput = {
  pathParams: Record<string, string>
  query: URLSearchParams
  body: unknown
  context: HostRequestContext
}

export type GatewayCatalogSnapshot = {
  catalog: FederatedToolCatalog
  manifests: Manifest[]
  errors: AgentGatewaySourceError[]
  toolsById: Map<string, FederatedCatalogTool>
  loadedAt: string
}

export type AgentGatewayDiagnostics = {
  enabled: boolean
  snapshotLoaded: boolean
  loadedAt?: string
  catalogVersion?: string
  generatedAt?: string
  toolCount: number
  errorCount: number
}

export type GatewayCatalogBuildInput = {
  config: HostAgentGatewayConfig
  configPath?: string
}

export type GatewayCatalogBuildOutput = GatewayCatalogSnapshot

export type ManifestLoadInput = {
  provider: HostAgentGatewayManifestProviderConfig
  configPath?: string
}

export type RemoteRoutesFetchInput = {
  source: HostAgentGatewayRemoteDomainSourceConfig
}

export type FederatedSourceTransformInput = {
  source: HostAgentGatewayRemoteDomainSourceConfig
}

export type SchemaValidationInput = {
  tool: FederatedCatalogTool
  manifests: Manifest[]
  route: DomainRouteManifestEntry | RouteSummaryEntry
  parsedInput: RouteInvokeInput
}

export type SchemaValidationResult = {
  ok: true
} | {
  ok: false
  message: string
}

export type SourceSelectionInput = {
  tool: FederatedCatalogTool
  sourceId?: string
}

export type SourceSelectionOutput = FederatedCatalogToolSource

export type CatalogToolsFilterInput = {
  snapshot: GatewayCatalogSnapshot
  domain?: string
}

export type CatalogToolsFilterOutput = AgentGatewayListResult

export type RouteLookupInput = {
  routes: DomainRouteManifestEntry[] | RouteSummaryEntry[]
  operationId: string
}

export type RouteLookupOutput = DomainRouteManifestEntry | RouteSummaryEntry | null

export type BuildOpenApiInput = {
  snapshot: GatewayCatalogSnapshot
  args: AgentGatewayOpenApiArgs
}

export type BuildOpenApiOutput = Record<string, unknown>

export type GatewayConfigResolved = HostAgentGatewayConfig

export type FederatedCatalogSources = FederatedCatalogSource[]

import { getAgentGatewayDiagnostics } from '$lib/agent-gateway-runtime'
import { getHostConfig, getHostRegistrationDiagnostics } from '$lib/host-config'
import { getHostPluginRegistryDiagnostics } from '$lib/host-plugins/registry'
import { readRuntimeConfigAdmin } from '$lib/server/aops-runtime-config'

const EXPECTED_PLUGINS: Record<string, { module: string; factory: string }> = {
  sys: { module: '@aopslab/domain-host-plugin-sys', factory: 'createSysPlugin' },
  agentspace: { module: './runtime/agentspace-host-adapter.mjs', factory: 'createCommunityAgentspacePlugin' },
  docman: { module: './runtime/docman-host-adapter.mjs', factory: 'createDocmanPlugin' },
  projectman: { module: './runtime/projectman-host-adapter.mjs', factory: 'createProjectmanPlugin' },
  chatv3: { module: '@aopslab/domain-host-plugin-chatv3', factory: 'createChatv3Plugin' },
}
const EXPECTED_PROVIDERS: Record<string, { module: string; exportName: string }> = {
  sys: { module: '@aopslab/domain-kit-sys', exportName: 'buildSysDomainCapabilityManifest' },
  agentspace: { module: './runtime/agentspace-tooling.mjs', exportName: 'buildCommunityAgentspaceDomainCapabilityManifest' },
  docman: { module: './runtime/docman-tooling.mjs', exportName: 'buildAopsDocmanDomainCapabilityManifest' },
  projectman: { module: '@aopslab/domain-kit-projectman', exportName: 'buildProjectmanDomainCapabilityManifest' },
  chatv3: { module: '@aopslab/domain-kit-chatv3', exportName: 'buildChatv3DomainCapabilityManifest' },
}

function assertExactRows(
  rows: Array<{ domain?: string; enabled?: boolean; module?: string; factory?: string; exportName?: string }>,
  expected: Record<string, { module: string; factory?: string; exportName?: string }>,
  label: string
): void {
  const expectedDomains = Object.keys(expected).sort()
  const actualDomains = rows.map((row) => String(row.domain ?? "")).sort()
  if (rows.length !== expectedDomains.length || new Set(actualDomains).size !== rows.length || actualDomains.some((value, index) => value !== expectedDomains[index])) {
    throw new Error(`community_host_admin_${label}_domain_mismatch`)
  }
  for (const row of rows) {
    const contract = expected[String(row.domain)]
    if (!contract || row.enabled !== true || row.module !== contract.module || (contract.factory !== undefined && row.factory !== contract.factory) || (contract.exportName !== undefined && row.exportName !== contract.exportName)) {
      throw new Error(`community_host_admin_${label}_identity_mismatch:${String(row.domain)}`)
    }
  }
}

export function areHostAdminPluginDiagnosticsEnabled(): boolean {
  return getHostConfig().diagnostics?.exposePluginBootstrap !== false
}

export async function readHostAdminPluginsSnapshot() {
  const config = getHostConfig()
  const plugins = config.plugins ?? []
  const providers = config.agentGateway?.catalog?.manifestProviders ?? []
  const sources = config.agentGateway?.sources ?? []
  assertExactRows(plugins, EXPECTED_PLUGINS, "plugin")
  assertExactRows(providers, EXPECTED_PROVIDERS, "provider")
  if (sources.length !== 0) throw new Error("community_host_admin_remote_source_forbidden")
  return {
    diagnostics: getHostPluginRegistryDiagnostics(),
    registrations: getHostRegistrationDiagnostics(),
    agentGateway: getAgentGatewayDiagnostics(),
    storage: { postgres: readRuntimeConfigAdmin() },
    sources: [],
  }
}

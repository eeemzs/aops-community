import configRaw from '../../host.config.json';
import { env as privateEnv } from '$env/dynamic/private';
import '$lib/server/aops-runtime-config';
import { validateHostConfig } from '@aopslab/host-core';
import type {
  HostAgentGatewayConfig,
  HostAgentGatewayHeaderBinding,
  HostAgentGatewayManifestProviderConfig,
  HostAgentGatewayRemoteDomainSourceConfig,
  HostPluginConfig,
  HostPluginLoaderConfig,
  HostRuntimeConfig,
  HostRuntimeEnvBinding,
} from '@aops/host-registration';

export type HostDiagnosticsConfig = { exposePluginBootstrap: boolean };
export type {
  HostAgentGatewayConfig,
  HostAgentGatewayHeaderBinding,
  HostAgentGatewayManifestProviderConfig,
  HostAgentGatewayRemoteDomainSourceConfig,
  HostPluginConfig,
  HostPluginLoaderConfig,
  HostRuntimeConfig,
  HostRuntimeEnvBinding,
} from '@aops/host-registration';

export type HostAppConfig = {
  host?: { name?: string; apiBasePath?: string; [key: string]: unknown };
  runtime?: HostRuntimeConfig;
  pluginLoader?: HostPluginLoaderConfig;
  diagnostics?: HostDiagnosticsConfig;
  agentGateway?: HostAgentGatewayConfig;
  plugins?: HostPluginConfig[];
  [key: string]: unknown;
};

export type HostConfigDomainInventory = {
  pluginDomains: string[];
  manifestProviderDomains: string[];
  sourceDomains: string[];
};

export type HostRegistrationDiagnostics = {
  registrationsDir: '<disabled:community-static-host-config>';
  count: 0;
  precedence: ['host.config.json'];
  explicit: HostConfigDomainInventory;
  installed: HostConfigDomainInventory;
  effective: HostConfigDomainInventory;
  registrations: [];
};

const COMMUNITY_DOMAINS = Object.freeze(["sys","agentspace","docman","projectman","chatv3"]);
const COMMUNITY_PLUGIN_MODULES = Object.freeze([
  '@aopslab/domain-host-plugin-sys',
  './runtime/agentspace-host-adapter.mjs',
  './runtime/docman-host-adapter.mjs',
  './runtime/projectman-host-adapter.mjs',
  '@aopslab/domain-host-plugin-chatv3',
]);
const COMMUNITY_RUNTIME_ENV_KEYS = Object.freeze(['AOPS_PG_URL']);

const codepointCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const sorted = (values: string[]) => [...values].sort(codepointCompare);
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

function exactSet(label: string, actual: string[], expected: readonly string[]): void {
  const left = sorted(actual.map(normalize).filter(Boolean));
  const right = sorted(expected.map(normalize).filter(Boolean));
  if (
    new Set(left).size !== left.length ||
    new Set(right).size !== right.length ||
    left.length !== right.length ||
    !left.every((value, index) => value === right[index])
  ) {
    throw new Error(`community_host_config_set_mismatch:${label}:expected=${right.join(',')}:actual=${left.join(',')}`);
  }
}

function inventory(config: HostAppConfig): HostConfigDomainInventory {
  return {
    pluginDomains: (config.plugins ?? []).map((plugin) => normalize(plugin.domain)).filter(Boolean),
    manifestProviderDomains: (config.agentGateway?.catalog?.manifestProviders ?? [])
      .map((provider) => normalize(provider.domain))
      .filter(Boolean),
    sourceDomains: (config.agentGateway?.sources ?? [])
      .map((source) => normalize(source.domain))
      .filter(Boolean),
  };
}

function validateStaticCommunityConfig(input: unknown): HostAppConfig {
  const issues = validateHostConfig(input);
  if (issues.length > 0) {
    const first = issues[0];
    throw new Error(`host_config_invalid:${first.code}:${first.path}`);
  }
  const config = structuredClone(input) as HostAppConfig;
  const domains = inventory(config);
  exactSet('plugins', domains.pluginDomains, COMMUNITY_DOMAINS);
  exactSet('manifest-providers', domains.manifestProviderDomains, COMMUNITY_DOMAINS);
  exactSet('remote-sources', domains.sourceDomains, []);
  exactSet('plugin-loader', config.pluginLoader?.allowlist ?? [], COMMUNITY_PLUGIN_MODULES);
  exactSet('runtime-env', Object.keys(config.runtime?.env ?? {}), COMMUNITY_RUNTIME_ENV_KEYS);
  if (
    config.pluginLoader?.strictAllowlist !== true ||
    config.pluginLoader?.tolerantBootstrap !== false ||
    config.agentGateway?.enabled !== true ||
    config.agentGateway?.includeLocal !== true ||
    config.agentGateway?.catalog?.enabled !== true
  ) {
    throw new Error('community_host_config_policy_mismatch');
  }
  return config;
}

const STATIC_HOST_CONFIG = validateStaticCommunityConfig(configRaw);
const EMPTY_INVENTORY = Object.freeze({
  pluginDomains: [],
  manifestProviderDomains: [],
  sourceDomains: [],
});

export function getHostConfig(): HostAppConfig {
  return structuredClone(STATIC_HOST_CONFIG);
}

export function getHostRegistrationDiagnostics(): HostRegistrationDiagnostics {
  const explicit = inventory(STATIC_HOST_CONFIG);
  return {
    registrationsDir: '<disabled:community-static-host-config>',
    count: 0,
    precedence: ['host.config.json'],
    explicit,
    installed: structuredClone(EMPTY_INVENTORY),
    effective: structuredClone(explicit),
    registrations: [],
  };
}

export function applyHostRuntimeEnv(config: HostAppConfig): void {
  const processEnv = process.env as Record<string, string | undefined>;
  const bindings = config.runtime?.env ?? {};
  exactSet('runtime-env-apply', Object.keys(bindings), COMMUNITY_RUNTIME_ENV_KEYS);
  for (const [targetKey, binding] of Object.entries(bindings)) {
    const resolved =
      (typeof binding.value === 'string' ? binding.value : undefined) ??
      (typeof binding.fromEnv === 'string'
        ? privateEnv[binding.fromEnv] ?? processEnv[binding.fromEnv]
        : undefined) ??
      (typeof binding.default === 'string' ? binding.default : undefined);
    if ((!resolved || resolved.trim().length === 0) && binding.required === true) {
      throw new Error(`host_runtime_env_required:${targetKey}`);
    }
    if (resolved && resolved.trim().length > 0) processEnv[targetKey] = resolved;
  }
}

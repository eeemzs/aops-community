import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type { DomainPlugin } from '@aopslab/host-core';
import { DomainPluginRegistry, normalizeDomainName } from '@aopslab/host-core';

import {
	applyHostRuntimeEnv,
	getHostConfig,
	type HostPluginConfig,
	type HostPluginLoaderConfig
} from '$lib/host-config';

type PluginLoadStatus = 'loaded' | 'skipped' | 'failed';

type PluginLoadDiagnostic = {
	domain: string;
	module: string | null;
	factory: string;
	status: PluginLoadStatus;
	durationMs: number;
	error?: string;
};

type RegistryBootstrapState = 'idle' | 'building' | 'ready' | 'failed';

export type HostPluginRegistryDiagnostics = {
	attempt: number;
	state: RegistryBootstrapState;
	startedAt?: string;
	finishedAt?: string;
	loadedDomains: string[];
	plugins: PluginLoadDiagnostic[];
	error?: string;
};

const runtimeImport = new Function('specifier', 'return import(specifier)') as (
	specifier: string
) => Promise<Record<string, unknown>>;
const nodeRequire = createRequire(import.meta.url);
let pluginImportVersion = 0;

const DEFAULT_DIAGNOSTICS: HostPluginRegistryDiagnostics = {
	attempt: 0,
	state: 'idle',
	loadedDomains: [],
	plugins: []
};

let singletonPromise: Promise<DomainPluginRegistry> | null = null;
let bootstrapAttempt = 0;
let registryDiagnostics: HostPluginRegistryDiagnostics = { ...DEFAULT_DIAGNOSTICS };

function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error ?? 'unknown_error');
}

function resolveModuleSpecifier(moduleName: string): string {
	const trimmed = moduleName.trim();
	if (!trimmed) return trimmed;
	if (trimmed.startsWith('file://')) return trimmed;
	if (path.isAbsolute(trimmed)) return pathToFileURL(trimmed).href;
	if (!trimmed.startsWith('.')) {
		const resolvePaths = [process.cwd(), path.resolve(process.cwd(), 'apps/aops-server')];
		try {
			const resolved = nodeRequire.resolve(trimmed, { paths: resolvePaths });
			return pathToFileURL(resolved).href;
		} catch {
			return trimmed;
		}
	}
	const absolutePath = path.resolve(process.cwd(), trimmed);
	return pathToFileURL(absolutePath).href;
}

function withImportVersion(specifier: string): string {
	if (!specifier.startsWith('file://')) return specifier;
	const url = new URL(specifier);
	url.searchParams.set('v', String(pluginImportVersion));
	return url.href;
}

function isModuleAllowed(moduleName: string, resolvedSpecifier: string, policy: HostPluginLoaderConfig): boolean {
	const allowlist = policy.allowlist ?? [];
	if (allowlist.length === 0) return policy.strictAllowlist === false;
	return allowlist.includes(moduleName) || allowlist.includes(resolvedSpecifier);
}

function assertModuleAllowed(
	moduleName: string,
	resolvedSpecifier: string,
	pluginConfig: HostPluginConfig,
	policy: HostPluginLoaderConfig
): void {
	if (isModuleAllowed(moduleName, resolvedSpecifier, policy)) return;

	if ((policy.allowlist ?? []).length === 0 && policy.strictAllowlist) {
		throw new Error(`plugin_module_allowlist_empty:${pluginConfig.domain}`);
	}

	throw new Error(`plugin_module_not_allowed:${pluginConfig.domain}:${moduleName}`);
}

async function createPluginFromConfig(
	pluginConfig: HostPluginConfig,
	policy: HostPluginLoaderConfig
): Promise<DomainPlugin> {
	const moduleName = pluginConfig.module;
	if (!moduleName) {
		throw new Error(`plugin_module_missing:${pluginConfig.domain}`);
	}

	const resolvedSpecifier = resolveModuleSpecifier(moduleName);
	assertModuleAllowed(moduleName, resolvedSpecifier, pluginConfig, policy);

	const exportName = pluginConfig.factory?.trim() || 'createPlugin';
	let mod: Record<string, unknown>;
	try {
		mod = await runtimeImport(withImportVersion(resolvedSpecifier));
	} catch (error) {
		throw new Error(
			`plugin_module_import_failed:${pluginConfig.domain}:${moduleName}:${extractErrorMessage(error)}`
		);
	}

	const maybeFactory = mod[exportName] ?? mod.default;
	if (typeof maybeFactory !== 'function') {
		throw new Error(`plugin_factory_not_found:${pluginConfig.domain}:${moduleName}#${exportName}`);
	}

	const instance = await Promise.resolve(
		(
			maybeFactory as (
				options?: Record<string, unknown>
			) => DomainPlugin | Promise<DomainPlugin>
		)(pluginConfig.options)
	);
	if (!instance || typeof instance !== 'object') {
		throw new Error(`plugin_factory_invalid_result:${pluginConfig.domain}`);
	}

	const configDomain = normalizeDomainName(pluginConfig.domain);
	const pluginDomain = normalizeDomainName(instance.domain ?? '');
	if (configDomain && pluginDomain && configDomain !== pluginDomain) {
		throw new Error(`plugin_config_domain_mismatch:${configDomain}:${pluginDomain}`);
	}

	return instance;
}

async function buildRegistry(): Promise<DomainPluginRegistry> {
	const registry = new DomainPluginRegistry();
	const config = getHostConfig();
	const policy = config.pluginLoader ?? {
		allowlist: [],
		strictAllowlist: false,
		tolerantBootstrap: false
	};
	const tolerantBootstrap = policy.tolerantBootstrap === true;
	const plugins = config.plugins ?? [];

	const diagnostics: HostPluginRegistryDiagnostics = {
		attempt: ++bootstrapAttempt,
		state: 'building',
		startedAt: new Date().toISOString(),
		loadedDomains: [],
		plugins: []
	};
	registryDiagnostics = diagnostics;

	applyHostRuntimeEnv(config);
	const failedDomains: string[] = [];
	try {
		for (const pluginConfig of plugins) {
			const pluginStart = Date.now();
			const domain = normalizeDomainName(pluginConfig.domain ?? '');
			const moduleName = pluginConfig.module?.trim() || null;
			const factoryName = pluginConfig.factory?.trim() || 'createPlugin';

			if (pluginConfig.enabled === false) {
				diagnostics.plugins.push({
					domain,
					module: moduleName,
					factory: factoryName,
					status: 'skipped',
					durationMs: Date.now() - pluginStart
				});
				continue;
			}

			try {
				const plugin = await createPluginFromConfig(pluginConfig, policy);
				registry.register(plugin);
				diagnostics.plugins.push({
					domain: normalizeDomainName(plugin.domain ?? domain),
					module: moduleName,
					factory: factoryName,
					status: 'loaded',
					durationMs: Date.now() - pluginStart
				});
			} catch (error) {
				const message = extractErrorMessage(error);
				diagnostics.plugins.push({
					domain,
					module: moduleName,
					factory: factoryName,
					status: 'failed',
					durationMs: Date.now() - pluginStart,
					error: message
				});

				if (tolerantBootstrap) {
					failedDomains.push(domain);
					continue;
				}
				throw new Error(`plugin_bootstrap_failed:${domain}:${message}`);
			}
		}

		diagnostics.state = 'ready';
		if (failedDomains.length > 0) {
			diagnostics.error = `plugin_bootstrap_partial_failure:${failedDomains.join(',')}`;
		}
		diagnostics.loadedDomains = registry.listDomains();
		diagnostics.finishedAt = new Date().toISOString();
		registryDiagnostics = diagnostics;
		return registry;
	} catch (error) {
		diagnostics.state = 'failed';
		diagnostics.error = extractErrorMessage(error);
		diagnostics.loadedDomains = registry.listDomains();
		diagnostics.finishedAt = new Date().toISOString();
		registryDiagnostics = diagnostics;
		throw error;
	}
}

export async function getHostPluginRegistry(): Promise<DomainPluginRegistry> {
	if (singletonPromise) return singletonPromise;
	singletonPromise = buildRegistry().catch((error) => {
		singletonPromise = null;
		throw error;
	});
	return singletonPromise;
}

export async function warmupHostPluginRegistry(): Promise<HostPluginRegistryDiagnostics> {
	const registry = await getHostPluginRegistry();
	for (const domain of registry.listDomains()) {
		await registry.ensureSetup(domain);
	}
	return getHostPluginRegistryDiagnostics();
}

export function getHostPluginRegistryDiagnostics(): HostPluginRegistryDiagnostics {
	return {
		...registryDiagnostics,
		loadedDomains: [...registryDiagnostics.loadedDomains],
		plugins: registryDiagnostics.plugins.map((plugin) => ({ ...plugin }))
	};
}

export function resetHostPluginRegistry(): void {
	singletonPromise = null;
	pluginImportVersion += 1;
	registryDiagnostics = {
		...DEFAULT_DIAGNOSTICS,
		loadedDomains: [],
		plugins: []
	};
}

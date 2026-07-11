import type { FederatedCatalogTool } from '@aopslab/manifest';

import { getAgentGateway } from '$lib/agent-gateway-runtime';
import { getHostConfig, type HostAgentGatewayManifestProviderConfig } from '$lib/host-config';
import { getAuthProvider, isTrustedLocalAuthProvider, type AopsAuthProvider } from '$lib/server/auth-provider';

import { normalizeDomain, normalizeToolId, resolveOperationKind } from './helpers';
import type {
	AgentGatewayDomainMetadata,
	AgentGatewayDomainResourceDescriptor,
	AgentGatewayListResult,
	AgentGatewayOperationDocs
} from './types';

const LANDING_PAGE_PATH = '/api-info';
const DISCOVERY_JSON_ALIAS_PATH = '/api-info.json';
const DISCOVERY_JSON_PATH = '/api/agent/discovery.json';
const TOOLS_PATH = '/api/agent/tools';
const TOOL_DETAIL_PREFIX = '/api/agent/tools/';
const PUBLIC_OPENAPI_PATH = '/openapi.json';
const OPENAPI_PATH = '/api/agent/openapi.json';
const INVOKE_PATH_SUFFIX = '/invoke';

const READ_KINDS = new Set([
	'list',
	'get',
	'search',
	'detail',
	'preview',
	'stats',
	'history',
	'diff',
	'compare',
	'check',
	'read'
]);

const WRITE_KINDS = new Set([
	'create',
	'update',
	'delete',
	'remove',
	'add',
	'set',
	'link',
	'unlink',
	'publish',
	'restore',
	'reset',
	'cleanup',
	'record',
	'copy'
]);

const WORKFLOW_KINDS = new Set([
	'compose',
	'generate',
	'plan',
	'review',
	'run',
	'execute',
	'start',
	'end',
	'sync',
	'export',
	'import',
	'convert'
]);

const DISCOVERY_FIRST_CONTACT_KIND_ORDER = [
	'list',
	'search',
	'get',
	'detail',
	'preview',
	'stats',
	'history',
	'diff',
	'compare',
	'check'
] as const;

const INVOKE_BODY_MODES = [
	{
		id: 'raw-input',
		summary: 'Send the tool input object directly as the JSON request body.'
	},
	{
		id: 'envelope',
		summary:
			'Use `{ sourceId?, input, preview?, apply?, confirm?, idempotencyKey? }` for guarded writes, preflight, or source overrides.'
	}
] as const;

const DISCOVERY_METADATA_CONTRACT = {
	canonicalSource: 'Domain Capability Manifest (DCM)',
	domainSummary: {
		preferred: 'manifest.docs.domain.summary',
		fallback: 'manifest.domain.description'
	},
	humanReadableResources: {
		preferred: [
			'manifest.capabilities.resources[].title',
			'manifest.docs.resources[resourceId].summary'
		],
		fallback: ['resource:* tag', 'service:* tag', 'operationId prefix']
	}
} as const;

function buildContextHeaders(authProvider: AopsAuthProvider) {
	const usesTrustedLocalAuth = isTrustedLocalAuthProvider(authProvider);
	return [
		{
			name: 'authorization',
			required: !usesTrustedLocalAuth,
			summary:
				usesTrustedLocalAuth
					? 'Omit on loopback requests when trusted-local auth is active; the runtime supplies a trusted local principal.'
					: 'Bearer token or authenticated browser session is required for invoke.'
		},
		{
			name: 'x-project-id',
			required: false,
			summary: 'Resolve project context by project id.'
		},
		{
			name: 'x-project-name',
			required: false,
			summary: 'Resolve project context by project name.'
		},
		{
			name: 'x-tenant-id',
			required: false,
			summary: 'Tenant context override.'
		},
		{
			name: 'x-locale',
			required: false,
			summary: 'Preferred locale for localized responses.'
		},
		{
			name: 'x-fallback-locale',
			required: false,
			summary: 'Fallback locale when the requested locale is unavailable.'
		}
	] as const;
}

type DiscoveryUrlSet = {
	landingPage: string;
	document: string;
	rawDocument: string;
	tools: string;
	openapi: string;
	rawOpenapi: string;
	toolDetailTemplate: string;
	invokeTemplate: string;
};

type ManifestProviderSummary = {
	id: string;
	domain: string;
	exportName: string;
	module: string;
	moduleKind: 'package' | 'file';
};

type ToolDetail = ReturnType<typeof buildToolDetail>;

type DiscoveryBucket = {
	id: string;
	label: string;
	count: number;
};

type DomainResourceSummary = {
	resourceId: string;
	title: string;
	summary?: string;
	kind?: string;
	notes?: string[];
	toolCount: number;
	operationKinds: string[];
	sampleToolIds: string[];
};

function toUrl(serverBaseUrl: string | undefined, path: string): string {
	return serverBaseUrl ? `${serverBaseUrl}${path}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toSafetyPolicy(tool: FederatedCatalogTool): Record<string, unknown> {
	if (!isRecord(tool.policy)) return {};
	return isRecord(tool.policy.safety) ? tool.policy.safety : {};
}

function withDomain(path: string, domain?: string): string {
	const normalizedDomain = normalizeDomain(domain ?? '');
	if (!normalizedDomain) return path;
	const separator = path.includes('?') ? '&' : '?';
	return `${path}${separator}domain=${encodeURIComponent(normalizedDomain)}`;
}

function compareDomains(left: string, right: string): number {
	if (left === right) return 0;
	if (left === 'projectman') return -1;
	if (right === 'projectman') return 1;
	return left.localeCompare(right);
}

function buildUrls(serverBaseUrl?: string, domain?: string): DiscoveryUrlSet {
	return {
		landingPage: toUrl(serverBaseUrl, withDomain(LANDING_PAGE_PATH, domain)),
		document: toUrl(serverBaseUrl, withDomain(DISCOVERY_JSON_ALIAS_PATH, domain)),
		rawDocument: toUrl(serverBaseUrl, withDomain(DISCOVERY_JSON_PATH, domain)),
		tools: toUrl(serverBaseUrl, withDomain(TOOLS_PATH, domain)),
		openapi: toUrl(serverBaseUrl, withDomain(PUBLIC_OPENAPI_PATH, domain)),
		rawOpenapi: toUrl(serverBaseUrl, withDomain(OPENAPI_PATH, domain)),
		toolDetailTemplate: toUrl(serverBaseUrl, `${TOOL_DETAIL_PREFIX}{toolId}`),
		invokeTemplate: toUrl(serverBaseUrl, `${TOOL_DETAIL_PREFIX}{toolId}${INVOKE_PATH_SUFFIX}`)
	};
}

function toManifestProviderSummary(
	provider: HostAgentGatewayManifestProviderConfig
): ManifestProviderSummary {
	const moduleValue = String(provider.module ?? '').trim();
	return {
		id: provider.id,
		domain: normalizeDomain(provider.domain),
		exportName: provider.exportName,
		module: moduleValue,
		moduleKind:
			moduleValue.startsWith('.') || moduleValue.startsWith('/') || moduleValue.startsWith('file://')
				? 'file'
				: 'package'
	};
}

function parseExample(exampleRaw: string | undefined): unknown {
	if (!exampleRaw) return {};
	try {
		return JSON.parse(exampleRaw);
	} catch {
		return { raw: exampleRaw };
	}
}

function findTagValue(tags: string[] | undefined, prefix: string): string | null {
	if (!Array.isArray(tags)) return null;
	const found = tags.find((tag) => typeof tag === 'string' && tag.startsWith(prefix));
	if (!found) return null;
	const value = found.slice(prefix.length).trim();
	return value.length > 0 ? value : null;
}

function normalizeLabel(value: string): string {
	return value
		.replace(/[-_.]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeResourceId(value: string): string {
	return String(value ?? '').trim().toLowerCase();
}

function inferOperationKindFromOperationId(operationId: string): string {
	const segments = String(operationId ?? '')
		.toLowerCase()
		.split('.')
		.filter(Boolean);
	const candidate = segments[segments.length - 1] ?? '';
	if (!candidate) return 'custom';

	if (READ_KINDS.has(candidate)) return candidate;
	if (WRITE_KINDS.has(candidate)) return candidate;
	if (WORKFLOW_KINDS.has(candidate)) return candidate;

	if (candidate.includes('list')) return 'list';
	if (candidate.includes('search')) return 'search';
	if (candidate.includes('preview')) return 'preview';
	if (candidate.includes('detail')) return 'detail';
	if (candidate.includes('history')) return 'history';
	if (candidate.includes('diff')) return 'diff';
	if (candidate.includes('compare')) return 'compare';
	if (candidate.includes('stats')) return 'stats';
	if (candidate.includes('check')) return 'check';
	if (candidate.includes('get')) return 'get';
	if (candidate.includes('create')) return 'create';
	if (candidate.includes('update')) return 'update';
	if (candidate.includes('delete')) return 'delete';
	if (candidate.includes('remove')) return 'remove';
	if (candidate.includes('add')) return 'add';
	if (candidate.includes('set')) return 'set';
	if (candidate.includes('publish')) return 'publish';
	if (candidate.includes('restore')) return 'restore';
	if (candidate.includes('reset')) return 'reset';
	if (candidate.includes('cleanup')) return 'cleanup';
	if (candidate.includes('sync')) return 'sync';
	if (candidate.includes('generate')) return 'generate';
	if (candidate.includes('plan')) return 'plan';
	if (candidate.includes('review')) return 'review';
	if (candidate.includes('compose')) return 'compose';
	if (candidate.includes('convert')) return 'convert';

	return candidate;
}

function resolveFallbackResourceId(tool: FederatedCatalogTool): string {
	return normalizeResourceId(
		findTagValue(tool.tags, 'resource:') ??
			findTagValue(tool.tags, 'service:') ??
			String(tool.operationId ?? '').split('.')[0] ??
			'resource'
	);
}

function findExplicitResourceDescriptor(
	tool: FederatedCatalogTool,
	domainMetadata?: AgentGatewayDomainMetadata
): AgentGatewayDomainResourceDescriptor | null {
	const resources = domainMetadata?.resources ?? [];
	if (resources.length === 0) return null;
	const resourcesById = new Map(
		resources.map((resource) => [normalizeResourceId(resource.resourceId), resource])
	);
	const candidateIds = [
		findTagValue(tool.tags, 'resource:'),
		String(tool.operationId ?? '').split('.')[0] ?? '',
		resolveFallbackResourceId(tool)
	]
		.map((value) => normalizeResourceId(value ?? ''))
		.filter(Boolean);

	for (const candidateId of candidateIds) {
		const descriptor = resourcesById.get(candidateId);
		if (descriptor) return descriptor;
	}

	return null;
}

function resolveDiscoveryOperationKind(tool: FederatedCatalogTool): string {
	return resolveOperationKind(tool) ?? inferOperationKindFromOperationId(tool.operationId);
}

function resolveCapabilityLane(tool: FederatedCatalogTool, operationKind: string): string {
	const tags = tool.tags ?? [];
	const normalizedTags = tags.map((tag) => tag.toLowerCase());

	if (
		normalizedTags.includes('maintenance') ||
		normalizedTags.includes('admin') ||
		normalizedTags.includes('system') ||
		operationKind === 'cleanup' ||
		operationKind === 'reset'
	) {
		return 'system-admin';
	}

	if (WORKFLOW_KINDS.has(operationKind)) {
		return 'workflow-automation';
	}

	if (tool.sideEffect !== 'none' || WRITE_KINDS.has(operationKind)) {
		return 'mutating-write';
	}

	return 'read-model';
}

function resolveSafetyClass(tool: FederatedCatalogTool, operationKind: string): string {
	if (tool.policy?.safety?.destructive === true) {
		return 'destructive';
	}

	if (['delete', 'remove', 'cleanup', 'restore', 'reset'].includes(operationKind)) {
		return 'destructive';
	}

	if (tool.sideEffect !== 'none' || WRITE_KINDS.has(operationKind) || WORKFLOW_KINDS.has(operationKind)) {
		return 'stateful-write';
	}

	return 'safe-read';
}

function buildRecommendationReason(params: {
	operationKind: string;
	resourceLabel: string;
	capability: string;
	safety: string;
}): string {
	const resourceLabel = params.resourceLabel || 'resource';

	if (params.safety === 'destructive') {
		return `Avoid as a first step because it can change or remove ${resourceLabel}.`;
	}

	if (params.operationKind === 'list') {
		return `Safe first read. It enumerates ${resourceLabel} so the agent can see the domain surface before acting.`;
	}

	if (params.operationKind === 'search') {
		return `Safe first read. It helps the agent discover matching ${resourceLabel} records quickly.`;
	}

	if (params.operationKind === 'get' || params.operationKind === 'detail') {
		return `Safe read-only inspection of a single ${resourceLabel} item.`;
	}

	if (params.operationKind === 'preview' || params.operationKind === 'stats') {
		return `Read-only preview that helps the agent understand ${resourceLabel} without mutating state.`;
	}

	if (params.capability === 'workflow-automation') {
		return `Useful after initial discovery, but not ideal as the very first tool because it starts a workflow.`;
	}

	if (params.capability === 'mutating-write') {
		return `Useful once the agent has context, but it mutates ${resourceLabel}.`;
	}

	return `General-purpose ${params.capability.replace(/-/g, ' ')} tool for ${resourceLabel}.`;
}

function buildDiscoveryMetadata(
	tool: FederatedCatalogTool,
	domainMetadata?: AgentGatewayDomainMetadata
) {
	const operationKind = resolveDiscoveryOperationKind(tool);
	const explicitResource = findExplicitResourceDescriptor(tool, domainMetadata);
	const fallbackResourceId = resolveFallbackResourceId(tool);
	const resourceId = normalizeResourceId(explicitResource?.resourceId ?? fallbackResourceId);
	const resourceTitle = explicitResource?.title?.trim() || normalizeLabel(resourceId);
	const resourceLabel = resourceTitle || normalizeLabel(resourceId);
	const capability = resolveCapabilityLane(tool, operationKind);
	const safety = resolveSafetyClass(tool, operationKind);
	const recommendedForFirstContact =
		safety === 'safe-read' &&
		capability === 'read-model' &&
		DISCOVERY_FIRST_CONTACT_KIND_ORDER.includes(
			operationKind as (typeof DISCOVERY_FIRST_CONTACT_KIND_ORDER)[number]
		);

	return {
		operationKind,
		resourceId,
		resourceLabel,
		resourceTitle,
		resourceSummary: explicitResource?.summary,
		resourceKind: explicitResource?.kind,
		resourceNotes: explicitResource?.notes,
		capability,
		safety,
		recommendedForFirstContact,
		recommendationReason: buildRecommendationReason({
			operationKind,
			resourceLabel,
			capability,
			safety
		})
	};
}

function buildInvokeExamples(tool: FederatedCatalogTool, serverBaseUrl?: string) {
	const authProvider = getAuthProvider();
	const usesTrustedLocalAuth = isTrustedLocalAuthProvider(authProvider);
	const rawInput = parseExample(tool.examples?.[0]);
	const invokePath = `${TOOL_DETAIL_PREFIX}${encodeURIComponent(tool.toolId)}${INVOKE_PATH_SUFFIX}`;
	const invokeUrl = toUrl(serverBaseUrl, invokePath);
	const sourceId = tool.defaultSourceId ?? tool.sources[0]?.id ?? 'local';
	const safety = toSafetyPolicy(tool);

	const curlLines = [
		`curl -X POST '${invokeUrl}'`,
		...(usesTrustedLocalAuth ? [] : [`  -H 'Authorization: Bearer <token>'`]),
		`  -H 'Content-Type: application/json'`,
		`  -d '${JSON.stringify(rawInput)}'`
	];

	return {
		method: 'POST',
		url: invokeUrl,
		rawInput,
		envelope: {
			sourceId,
			input: rawInput,
			...(safety.applyRequired === true ? { apply: true, idempotencyKey: '<idempotency-key>' } : {}),
			...(safety.confirmationRequired === true ? { confirm: true } : {})
		},
		curl: curlLines.join(' \\\n')
	};
}

function buildToolDetail(
	tool: FederatedCatalogTool,
	serverBaseUrl?: string,
	operationDocs?: AgentGatewayOperationDocs,
	domainMetadata?: AgentGatewayDomainMetadata,
	inputJsonSchema?: Record<string, unknown> | null
) {
	const detailPath = `${TOOL_DETAIL_PREFIX}${encodeURIComponent(tool.toolId)}`;
	const invokeExamples = buildInvokeExamples(tool, serverBaseUrl);
	const discovery = buildDiscoveryMetadata(tool, domainMetadata);

	return {
		toolId: tool.toolId,
		domain: tool.domain,
		domainInfo: {
			domain: normalizeDomain(tool.domain),
			displayName: domainMetadata?.displayName ?? normalizeLabel(tool.domain),
			summary: domainMetadata?.summary ?? domainMetadata?.description ?? null,
			notes: domainMetadata?.notes ?? []
		},
		operationId: tool.operationId,
		title: tool.title ?? tool.summary ?? tool.operationId,
		summary: tool.summary ?? tool.title ?? '',
		sideEffect: tool.sideEffect ?? 'none',
		tags: tool.tags ?? [],
		inputSchemaRef: tool.inputSchemaRef ?? null,
		inputJsonSchema: inputJsonSchema ?? null,
		outputSchemaRef: tool.outputSchemaRef ?? null,
		policy: tool.policy ?? null,
		defaultSourceId: tool.defaultSourceId ?? null,
		sources: tool.sources,
		examples: (tool.examples ?? []).map((entry) => parseExample(entry)),
		docs: operationDocs ?? null,
		resource: {
			resourceId: discovery.resourceId,
			title: discovery.resourceTitle,
			summary: discovery.resourceSummary ?? null,
			kind: discovery.resourceKind ?? null,
			notes: discovery.resourceNotes ?? []
		},
		discovery,
		links: {
			self: toUrl(serverBaseUrl, detailPath),
			invoke: invokeExamples.url,
			openapi: toUrl(
				serverBaseUrl,
				`${PUBLIC_OPENAPI_PATH}#${encodeURIComponent(`/api/agent/tools/${tool.toolId}/invoke`)}`
			)
		},
		invoke: {
			bodyModes: INVOKE_BODY_MODES,
			url: invokeExamples.url,
			rawInputExample: invokeExamples.rawInput,
			envelopeTemplate: invokeExamples.envelope,
			examples: invokeExamples
		}
	};
}

function buildBuckets(values: string[], formatter?: (value: string) => string): DiscoveryBucket[] {
	const counts = new Map<string, number>();
	for (const value of values) {
		const normalized = value.trim();
		if (!normalized) continue;
		counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.map(([id, count]) => ({
			id,
			label: formatter ? formatter(id) : normalizeLabel(id),
			count
		}))
		.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildTaxonomy(tools: ToolDetail[]) {
	return {
		capabilities: buildBuckets(tools.map((tool) => tool.discovery.capability)),
		operationKinds: buildBuckets(tools.map((tool) => tool.discovery.operationKind)),
		resources: buildBuckets(tools.map((tool) => tool.discovery.resourceId))
	};
}

function buildFallbackResourceSummary(
	resourceTitle: string,
	operationKinds: string[],
	domainLabel: string
): string {
	if (operationKinds.length === 0) {
		return `${resourceTitle} entries exposed by the ${domainLabel} domain.`;
	}
	if (operationKinds.length === 1) {
		return `Supports ${operationKinds[0]} operations for ${resourceTitle.toLowerCase()} in the ${domainLabel} domain.`;
	}
	const listedKinds = operationKinds.slice(0, 4).join(', ');
	return `Supports ${listedKinds} operations for ${resourceTitle.toLowerCase()} in the ${domainLabel} domain.`;
}

function buildHumanReadableResources(
	domainTools: ToolDetail[],
	domainMetadata?: AgentGatewayDomainMetadata
): DomainResourceSummary[] {
	const grouped = new Map<string, ToolDetail[]>();
	for (const tool of domainTools) {
		const resourceId = normalizeResourceId(tool.discovery.resourceId);
		const existing = grouped.get(resourceId);
		if (existing) {
			existing.push(tool);
			continue;
		}
		grouped.set(resourceId, [tool]);
	}

	const explicitResources = domainMetadata?.resources ?? [];
	const explicitById = new Map(
		explicitResources.map((resource) => [normalizeResourceId(resource.resourceId), resource])
	);
	const resourceIds = new Set<string>([
		...grouped.keys(),
		...explicitResources.map((resource) => normalizeResourceId(resource.resourceId))
	]);
	const domainLabel = domainMetadata?.displayName ?? normalizeLabel(domainTools[0]?.domain ?? 'domain');

	return [...resourceIds]
		.map((resourceId) => {
			const tools = grouped.get(resourceId) ?? [];
			const explicit = explicitById.get(resourceId);
			const operationKinds = [...new Set(tools.map((tool) => tool.discovery.operationKind))];
			const title =
				explicit?.title?.trim() ||
				tools[0]?.discovery.resourceTitle ||
				normalizeLabel(resourceId);
			return {
				resourceId,
				title,
				summary:
					explicit?.summary ??
					buildFallbackResourceSummary(title, operationKinds, domainLabel),
				kind: explicit?.kind ?? tools[0]?.discovery.resourceKind,
				notes: explicit?.notes,
				toolCount: tools.length,
				operationKinds,
				sampleToolIds: tools.slice(0, 6).map((tool) => tool.toolId)
			};
		})
		.sort(
			(left, right) =>
				right.toolCount - left.toolCount ||
				left.title.localeCompare(right.title) ||
				left.resourceId.localeCompare(right.resourceId)
		);
}

function scoreToolForDiscovery(tool: ToolDetail): number {
	let score = 0;

	if (tool.discovery.safety === 'safe-read') score += 120;
	if (tool.discovery.safety === 'stateful-write') score -= 25;
	if (tool.discovery.safety === 'destructive') score -= 90;

	if (tool.discovery.capability === 'read-model') score += 30;
	if (tool.discovery.capability === 'workflow-automation') score += 5;
	if (tool.discovery.capability === 'mutating-write') score -= 10;
	if (tool.discovery.capability === 'system-admin') score -= 20;

	const kindIndex = DISCOVERY_FIRST_CONTACT_KIND_ORDER.indexOf(
		tool.discovery.operationKind as (typeof DISCOVERY_FIRST_CONTACT_KIND_ORDER)[number]
	);
	if (kindIndex >= 0) {
		score += 40 - kindIndex * 3;
	}

	if (tool.examples.length > 0) score += 8;
	if (tool.summary.length > 0) score += 4;
	if (tool.sources.some((source) => source.kind === 'local-route')) score += 2;
	if (tool.domain === 'projectman') score += 5;

	return score;
}

function toRecommendation(tool: ToolDetail) {
	return {
		toolId: tool.toolId,
		domain: tool.domain,
		title: tool.title,
		summary: tool.summary,
		reason: tool.discovery.recommendationReason,
		operationKind: tool.discovery.operationKind,
		capability: tool.discovery.capability,
		safety: tool.discovery.safety,
		resource: tool.discovery.resourceLabel,
		links: {
			detail: tool.links.self,
			invoke: tool.links.invoke,
			openapi: tool.links.openapi
		},
		example: tool.invoke.rawInputExample
	};
}

function buildRecommendedTools(tools: ToolDetail[], count: number) {
	return [...tools]
		.sort((left, right) => scoreToolForDiscovery(right) - scoreToolForDiscovery(left) || left.toolId.localeCompare(right.toolId))
		.slice(0, count)
		.map((tool) => toRecommendation(tool));
}

function groupToolsByDomain(
	tools: ToolDetail[],
	serverBaseUrl?: string,
	providersByDomain?: Map<string, ManifestProviderSummary>,
	domainMetadataByDomain?: Record<string, AgentGatewayDomainMetadata>
) {
	const grouped = new Map<string, ToolDetail[]>();

	for (const tool of tools) {
		const domain = normalizeDomain(tool.domain);
		const existing = grouped.get(domain);
		if (existing) {
			existing.push(tool);
			continue;
		}
		grouped.set(domain, [tool]);
	}

	return Array.from(grouped.entries())
		.sort(([left], [right]) => compareDomains(left, right))
		.map(([domain, domainTools]) => {
			const domainMetadata = domainMetadataByDomain?.[domain];
			return {
				domain,
				displayName: domainMetadata?.displayName ?? normalizeLabel(domain),
				summary:
					domainMetadata?.summary ??
					domainMetadata?.description ??
					`${normalizeLabel(domain)} domain exposed through manifest-synced tools.`,
				usageNotes: domainMetadata?.notes ?? [],
				toolCount: domainTools.length,
				provider: providersByDomain?.get(domain) ?? null,
				manifestProvider: providersByDomain?.get(domain) ?? null,
				links: {
					tools: toUrl(serverBaseUrl, withDomain(TOOLS_PATH, domain)),
					openapi: toUrl(serverBaseUrl, withDomain(PUBLIC_OPENAPI_PATH, domain)),
					rawOpenapi: toUrl(serverBaseUrl, withDomain(OPENAPI_PATH, domain)),
					discovery: toUrl(serverBaseUrl, withDomain(DISCOVERY_JSON_ALIAS_PATH, domain)),
					rawDiscovery: toUrl(serverBaseUrl, withDomain(DISCOVERY_JSON_PATH, domain)),
					landingPage: toUrl(serverBaseUrl, withDomain(LANDING_PAGE_PATH, domain))
				},
				previewToolIds: domainTools.slice(0, 6).map((tool) => tool.toolId),
				sampleToolIds: domainTools.slice(0, 6).map((tool) => tool.toolId),
				publicOpenApiUrl: toUrl(serverBaseUrl, withDomain(PUBLIC_OPENAPI_PATH, domain)),
				recommendedFirstTools: buildRecommendedTools(domainTools, 3),
				humanReadableResources: buildHumanReadableResources(domainTools, domainMetadata),
				taxonomy: buildTaxonomy(domainTools),
				tools: domainTools
			};
		});
}

export function buildAgentDiscoveryDocument(input: {
	listResult: AgentGatewayListResult;
	serverBaseUrl?: string;
	domain?: string;
	manifestProviders?: HostAgentGatewayManifestProviderConfig[];
}) {
	const domain = normalizeDomain(input.domain ?? '') || undefined;
	const authProvider = getAuthProvider();
	const usesTrustedLocalAuth = isTrustedLocalAuthProvider(authProvider);
	const invokeAuthMode = usesTrustedLocalAuth ? 'runtime-principal' : 'authenticated';
	const contextHeaders = buildContextHeaders(authProvider);
	const urls = buildUrls(input.serverBaseUrl, domain);
	const providerSummaries = (input.manifestProviders ?? [])
		.filter((provider) => provider.enabled)
		.map((provider) => toManifestProviderSummary(provider));
	const providersByDomain = new Map(providerSummaries.map((provider) => [provider.domain, provider]));
	const domainMetadataByDomain = input.listResult.domainMetadataByDomain ?? {};
	const tools = input.listResult.tools.map((tool) =>
		buildToolDetail(
			tool,
			input.serverBaseUrl,
			input.listResult.operationDocsByOperationId?.[normalizeToolId(tool.operationId)],
			domainMetadataByDomain[normalizeDomain(tool.domain)]
		)
	);
	const domains = groupToolsByDomain(tools, input.serverBaseUrl, providersByDomain, domainMetadataByDomain);
	const referenceDomain =
		domains.find((entry) => entry.domain === 'projectman') ?? domains[0] ?? null;
	const featuredTool = referenceDomain?.recommendedFirstTools[0] ?? null;
	const sourceOfTruth =
		'Domain Capability Manifest (DCM) is canonical. Tool catalog, OpenAPI, public discovery JSON, and landing metadata are generated projections derived from per-domain manifest providers.';
	const publicRoutes = [
		{
			method: 'GET',
			auth: 'public',
			purpose: 'HTML landing page for first-contact AI discovery.',
			url: urls.landingPage
		},
		{
			method: 'GET',
			auth: 'public',
			purpose: 'Machine-readable discovery JSON alias.',
			url: urls.document
		},
		{
			method: 'GET',
			auth: 'public',
			purpose: 'Raw discovery JSON under /api/agent.',
			url: urls.rawDocument
		},
		{
			method: 'GET',
			auth: 'public',
			purpose: 'Tool catalog list.',
			url: urls.tools
		},
		{
			method: 'GET',
			auth: 'public',
			purpose: 'Public OpenAPI alias.',
			url: urls.openapi
		},
		{
			method: 'GET',
			auth: 'public',
			purpose: 'Raw OpenAPI projection under /api/agent.',
			url: urls.rawOpenapi
		},
		{
			method: 'GET',
			auth: 'public',
			purpose: 'Single tool detail document.',
			url: urls.toolDetailTemplate
		}
	];
	const protectedRoutes = [
		{
			method: 'POST',
			auth: usesTrustedLocalAuth ? 'runtime-principal' : 'protected',
			purpose: 'Invoke a tool through the federated gateway.',
			url: urls.invokeTemplate
		}
	];
	const usageProtocol = {
		principle:
			'Before using a tool, inspect help or detail first. Do not guess architecture from the landing page.',
		helpFirstRule:
			'If a sibling help-like tool exists (`*.help`, `*.describe`, `*.usage`), inspect that first. Otherwise use tool detail and OpenAPI before invoke.',
		helpToolPatterns: ['.help', '.describe', '.usage'],
		steps: [
			{
				order: 1,
				id: 'read-aops-summary',
				title: 'Read the AOPS summary',
				action: `GET ${urls.document}`,
				outcome: 'Understand what this host is and what it is not.'
			},
			{
				order: 2,
				id: 'pick-tool',
				title: 'Pick a manifest-synced tool',
				action: `GET ${urls.tools}`,
				outcome: 'Choose a domain and a toolId from the synced catalog.'
			},
			{
				order: 3,
				id: 'inspect-help-or-detail',
				title: 'Inspect help/detail before execution',
				action: `GET ${urls.toolDetailTemplate}`,
				outcome: 'Look for help-like toolIds first; otherwise use tool detail and OpenAPI.'
			},
			{
				order: 4,
				id: 'inspect-openapi',
				title: 'Inspect schemas only if needed',
				action: `GET ${urls.openapi}`,
				outcome: 'Use schema-level details when input/output is not obvious from the detail document.'
			},
			{
				order: 5,
				id: 'invoke',
				title:
					usesTrustedLocalAuth
						? 'Invoke with trusted local principal'
						: 'Invoke with auth',
				action: `POST ${urls.invokeTemplate}`,
				outcome: 'Execute only after you understand the tool input and safety profile.'
			}
		]
	};

	return {
		ok: true,
		discoveryVersion: '1.2',
		domain,
		catalogVersion: input.listResult.catalogVersion,
		service: {
			name: 'aops-server',
			audience: ['ai-agent', 'tooling-client', 'browser'],
			summary:
				'AOPS, the Agentic Operations System, exposes a manifest-derived tooling gateway for AI agents. Tool catalog, OpenAPI, and discovery surfaces are generated projections, not the canonical source.',
			discoveryPageUrl: urls.landingPage,
			discoveryJsonUrl: urls.document,
			rawDiscoveryJsonUrl: urls.rawDocument,
			publicOpenApiUrl: urls.openapi,
			rawOpenApiUrl: urls.rawOpenapi
		},
		system: {
			kind: 'manifest-synced-tooling-host',
			firstContactStatement:
				'AOPS stands for Agentic Operations System. It is a manifest-synced host runtime that simultaneously acts as a domain API host, an agent execution gateway, and the AOPS application runtime itself.',
			summary:
				'AOPS is a manifest-synced tooling host and agent gateway. It exists to help an AI discover, inspect, and invoke tools without treating the discovery surface as an internal topology document.',
			scope:
				'This page is only the manifest-synced discovery surface for the AOPS agent gateway. It describes tool discovery metadata, tool-detail routes, OpenAPI links, and invoke entry points for manifest-backed tools; it does not describe internal service topology.',
			purpose: [
				'AOPS is a host runtime with three simultaneous roles: domain API host, agent execution gateway, and agentic operations application.',
				'AOPS can host multiple local domain plugins in one runtime and can also route to remote domain sources.',
				'Capability identity comes from kit operation contracts; host/API and agent projections are derived from the same manifest path.'
			],
			notThis: [
				'Do not treat this landing page as a microservice architecture description.',
				'Do not infer event sourcing, event-driven topology, or internal service boundaries from this endpoint.',
				'Do not execute a tool before inspecting its help/detail contract.'
			]
		},
		catalog: {
			catalogVersion: input.listResult.catalogVersion,
			generatedAt: input.listResult.generatedAt,
			partial: input.listResult.errors.length > 0,
			toolCount: tools.length,
			domainCount: domains.length
		},
		provenance: {
			canonicalSource: 'Domain Capability Manifest (DCM)',
			projectionRule:
				'Host routes, tool catalog, OpenAPI, and public AI discovery surfaces are projections derived from per-domain manifests.',
			discoveryMetadataContract: DISCOVERY_METADATA_CONTRACT,
			manifestProviders: providerSummaries,
			referenceDomain
		},
		auth: {
			discovery: 'public-read',
			authProvider,
			invoke: invokeAuthMode,
			summary:
				usesTrustedLocalAuth
					? 'GET discovery endpoints are public. This host uses trusted-local auth, so POST tool invocation uses a trusted local principal on loopback requests.'
					: 'GET discovery endpoints are public. POST tool invocation remains protected by bearer token or session auth.',
			note:
				usesTrustedLocalAuth
					? 'Discovery endpoints are public. With trusted-local auth, invoke requests succeed only on loopback and use the runtime principal.'
					: 'Discovery endpoints are public so an AI can inspect the host on first contact. Tool execution still requires authentication.',
			publicRoutes,
			protectedRoutes
		},
		routes: {
			landingPage: urls.landingPage,
			discoveryDocument: urls.document,
			rawDiscoveryDocument: urls.rawDocument,
			toolCatalog: urls.tools,
			openapi: urls.openapi,
			rawOpenapi: urls.rawOpenapi,
			toolDetailTemplate: urls.toolDetailTemplate,
			invokeTemplate: urls.invokeTemplate,
			domainApiTemplate: toUrl(input.serverBaseUrl, '/api/{domain}/...')
		},
		instructions: [
			'Treat AOPS as a tooling discovery and invocation host, not as a topology or architecture document.',
			'Start with /api-info.json, then use /api/agent/tools to enumerate manifest-synced toolIds.',
			'Before invoke, inspect a help-like sibling tool when present (`*.help`, `*.describe`, `*.usage`); otherwise read the tool detail document first.',
			'Open /openapi.json only when you need contract-level input/output schema details.',
			usesTrustedLocalAuth
				? 'Invoke tools through /api/agent/tools/{toolId}/invoke after the tool purpose, safety, and input are clear. Trusted-local auth supplies a trusted local principal on loopback requests.'
				: 'Invoke tools through /api/agent/tools/{toolId}/invoke only after the tool purpose, safety, and input are clear.'
		],
		usageProtocol,
		invoke: {
			bodyModes: INVOKE_BODY_MODES,
			contextHeaders
		},
			entry: {
				primer:
					'AOPS stands for Agentic Operations System. This endpoint is its manifest-synced tooling discovery surface for AI agents: read discovery first, inspect help/detail before execution, and do not infer internal architecture from this endpoint.',
			purpose:
				'This host exposes an AI-oriented tooling gateway. Start with discovery, inspect tool detail or help, consult OpenAPI only when needed, then invoke tools through the gateway.',
			canonicalSource: 'Domain Capability Manifest (DCM)',
			discoveryDocument: urls.document,
			rawDiscoveryDocument: urls.rawDocument,
			toolCatalog: urls.tools,
			openapi: urls.openapi,
			rawOpenapi: urls.rawOpenapi,
			invokeTemplate: urls.invokeTemplate,
			domainApiTemplate: toUrl(input.serverBaseUrl, '/api/{domain}/...'),
			bodyModes: INVOKE_BODY_MODES.map((mode) => mode.id),
			recommendedFlow: [
				`GET ${urls.document}`,
				`GET ${urls.tools}`,
				featuredTool ? `GET ${featuredTool.links.detail}` : null,
				`GET ${urls.openapi}`,
				usesTrustedLocalAuth
					? `POST ${urls.invokeTemplate} (trusted-local runtime principal)`
					: `POST ${urls.invokeTemplate}`
			].filter((step): step is string => Boolean(step))
		},
		manifestSource: {
			sourceOfTruth,
			discoveryMetadataContract: DISCOVERY_METADATA_CONTRACT,
			manifestProviders: providerSummaries
		},
		openApi: {
			url: urls.openapi,
			rawUrl: urls.rawOpenapi,
			pathCount: tools.length + 2
		},
		taxonomy: buildTaxonomy(tools),
		recommendations: {
			firstContactTools: buildRecommendedTools(tools, 6),
			byDomain: domains.map((entry) => ({
				domain: entry.domain,
				tools: entry.recommendedFirstTools
			}))
		},
		featured: featuredTool
			? {
					domain: referenceDomain?.domain ?? featuredTool.domain,
					reason:
						referenceDomain?.domain === 'projectman'
							? 'Projectman is exposed as a manifest-backed domain and works well as a concrete reference for multi-tool AI discovery.'
							: 'First available manifest-backed domain in the current catalog.',
					tool: featuredTool
				}
			: null,
		tools,
		domains,
		errors: input.listResult.errors
	};
}

export async function getAgentDiscoveryDocument(params: { domain?: string; serverBaseUrl?: string }) {
	const gateway = getAgentGateway();
	const domain = normalizeDomain(params.domain ?? '') || undefined;
	const listResult = await gateway.listTools(domain);
	const hostConfig = getHostConfig();
	return buildAgentDiscoveryDocument({
		listResult,
		serverBaseUrl: params.serverBaseUrl,
		domain,
		manifestProviders: hostConfig.agentGateway?.catalog?.manifestProviders
	});
}

export async function getAgentToolDetailDocument(params: {
	toolId: string;
	serverBaseUrl?: string;
}) {
	const gateway = getAgentGateway();
	const toolId = normalizeToolId(params.toolId);
	const listResult = await gateway.listTools();
	const tool = listResult.tools.find((entry) => normalizeToolId(entry.toolId) === toolId);

	if (!tool) {
		return null;
	}

	const hostConfig = getHostConfig();
	const provider = hostConfig.agentGateway?.catalog?.manifestProviders
		?.filter((entry) => entry.enabled)
		.map((entry) => toManifestProviderSummary(entry))
		.find((entry) => entry.domain === normalizeDomain(tool.domain));

	const inputJsonSchema = await gateway.getToolInputJsonSchema(tool.toolId);

	return {
		ok: true,
		catalogVersion: listResult.catalogVersion,
		generatedAt: listResult.generatedAt,
		auth: {
			read: 'public-read',
			authProvider: getAuthProvider(),
			invoke: isTrustedLocalAuthProvider(getAuthProvider()) ? 'runtime-principal' : 'authenticated'
		},
		provenance: {
			canonicalSource: 'Domain Capability Manifest (DCM)',
			discoveryMetadataContract: DISCOVERY_METADATA_CONTRACT,
			provider
		},
		tool: buildToolDetail(
			tool,
			params.serverBaseUrl,
			listResult.operationDocsByOperationId?.[normalizeToolId(tool.operationId)],
			listResult.domainMetadataByDomain?.[normalizeDomain(tool.domain)],
			inputJsonSchema
		),
		links: {
			discovery: toUrl(params.serverBaseUrl, DISCOVERY_JSON_ALIAS_PATH),
			rawDiscovery: toUrl(params.serverBaseUrl, DISCOVERY_JSON_PATH),
			openapi: toUrl(params.serverBaseUrl, PUBLIC_OPENAPI_PATH),
			rawOpenapi: toUrl(params.serverBaseUrl, OPENAPI_PATH),
			catalog: toUrl(params.serverBaseUrl, TOOLS_PATH),
			filteredCatalog: toUrl(
				params.serverBaseUrl,
				withDomain(TOOLS_PATH, normalizeDomain(tool.domain))
			)
		}
	};
}

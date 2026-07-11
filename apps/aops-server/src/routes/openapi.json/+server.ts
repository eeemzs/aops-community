import { json, type RequestHandler } from '@sveltejs/kit';

import { getAgentGateway } from '$lib/agent-gateway-runtime';
import { resolveRequestBaseUrl } from '$lib/server/request-base-url';
import { getAuthProvider, isTrustedLocalAuthProvider } from '$lib/server/auth-provider';

export const GET: RequestHandler = async ({ request, url }) => {
	const gateway = getAgentGateway();
	const domain = url.searchParams.get('domain')?.trim().toLowerCase() || undefined;
	const serverBaseUrl = resolveRequestBaseUrl(request, url);
	const withDomain = (path: string) =>
		domain ? `${path}${path.includes('?') ? '&' : '?'}domain=${encodeURIComponent(domain)}` : path;

	try {
		const authProvider = getAuthProvider();
		const usesTrustedLocalAuth = isTrustedLocalAuthProvider(authProvider);
		const openApi = await gateway.getOpenApi({ domain, serverBaseUrl });
		openApi['x-agent-discovery'] = {
			landingPage: serverBaseUrl ? `${serverBaseUrl}${withDomain('/api-info')}` : withDomain('/api-info'),
			document: serverBaseUrl
				? `${serverBaseUrl}${withDomain('/api-info.json')}`
				: withDomain('/api-info.json'),
			rawDocument: serverBaseUrl
				? `${serverBaseUrl}${withDomain('/api/agent/discovery.json')}`
				: withDomain('/api/agent/discovery.json'),
			toolCatalog: serverBaseUrl
				? `${serverBaseUrl}${withDomain('/api/agent/tools')}`
				: withDomain('/api/agent/tools'),
			toolDetailTemplate: serverBaseUrl
				? `${serverBaseUrl}/api/agent/tools/{toolId}`
				: '/api/agent/tools/{toolId}',
			invokeTemplate: serverBaseUrl
				? `${serverBaseUrl}/api/agent/tools/{toolId}/invoke`
				: '/api/agent/tools/{toolId}/invoke',
			publicOpenApi: serverBaseUrl
				? `${serverBaseUrl}${withDomain('/openapi.json')}`
				: withDomain('/openapi.json'),
			rawOpenApi: serverBaseUrl
				? `${serverBaseUrl}${withDomain('/api/agent/openapi.json')}`
				: withDomain('/api/agent/openapi.json'),
			bodyModes: ['raw-input', 'envelope'],
			canonicalSource: 'Domain Capability Manifest (DCM)',
			discoveryMetadataContract: {
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
			},
			system: {
				kind: 'manifest-synced-tooling-host',
				firstContactStatement:
					'AOPS stands for Agentic Operations System. Treat it as a manifest-synced tool gateway and discovery surface, not as an internal architecture map.',
				notThis: [
					'Do not treat this endpoint as a microservice architecture description.',
					'Do not infer event-driven topology or internal service boundaries from this endpoint.'
				]
			},
			usageProtocol: {
				helpFirstRule:
					'If a sibling help-like tool exists (`*.help`, `*.describe`, `*.usage`), inspect that first. Otherwise use tool detail and OpenAPI before invoke.',
				steps: [
					'GET /api-info.json',
					'GET /api/agent/tools',
					'GET /api/agent/tools/{toolId}',
					'GET /openapi.json only if schema detail is needed',
					usesTrustedLocalAuth
						? 'POST /api/agent/tools/{toolId}/invoke (trusted-local runtime principal)'
						: 'POST /api/agent/tools/{toolId}/invoke with auth'
				]
			},
			authProvider
		};
		return json(openApi, { status: 200 });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error ?? 'unknown_error');
		return json({ ok: false, error: 'openapi_generation_failed', message }, { status: 500 });
	}
};

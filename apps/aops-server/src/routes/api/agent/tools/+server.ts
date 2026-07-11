import { json, type RequestHandler } from '@sveltejs/kit';

import { getAgentGateway } from '$lib/agent-gateway-runtime';
import { buildAgentDiscoveryDocument } from '$lib/agent-gateway/discovery';
import { getHostConfig } from '$lib/host-config';
import { resolveRequestBaseUrl } from '$lib/server/request-base-url';

const AGENT_FLOW_OVERVIEW = {
	version: '1.0',
	appliesTo: 'all-domains',
	summary: 'Use /api/agent/tools for tool orchestration; use /api/{domain}/... for direct domain routes.',
	routes: {
		agentCatalog: '/api/agent/tools',
		agentInvoke: '/api/agent/tools/{toolId}/invoke',
		domainApi: '/api/{domain}/...'
	},
	semantics: {
		agentGateway: 'Tool catalog + schema-aware invoke + local/remote source routing.',
		domainApi: 'Direct host domain router to plugin route projection.'
	},
	ascii: {
		agentInvoke: [
			'client -> /api/agent/tools/{toolId}/invoke',
			'-> agent gateway',
			'-> local plugin route OR remote source',
			'-> operation',
			'-> response'
		],
		domainApi: [
			'client -> /api/{domain}/...',
			'-> host domain router',
			'-> domain plugin route',
			'-> operation',
			'-> response'
		]
	}
} as const;

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const domain = url.searchParams.get('domain')?.trim().toLowerCase();
		const gateway = getAgentGateway();
		const result = await gateway.listTools(domain);
		const serverBaseUrl = resolveRequestBaseUrl(request, url);
		const hostConfig = getHostConfig();
		const discovery = buildAgentDiscoveryDocument({
			listResult: result,
			serverBaseUrl,
			domain,
			manifestProviders: hostConfig.agentGateway?.catalog?.manifestProviders
		});
		return json(
			{
				ok: true,
				catalogVersion: result.catalogVersion,
				generatedAt: result.generatedAt,
				partial: result.errors.length > 0,
				flow: AGENT_FLOW_OVERVIEW,
				discovery: {
					routes: discovery.routes,
					auth: discovery.auth,
					invoke: discovery.invoke,
					provenance: discovery.provenance,
					domains: discovery.domains,
					taxonomy: discovery.taxonomy,
					recommendations: discovery.recommendations
				},
				tools: result.tools,
				errors: result.errors
			},
			{ status: 200 }
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error ?? 'unknown_error');
		return json({ ok: false, error: 'tool_list_failed', message }, { status: 500 });
	}
};

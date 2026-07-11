import { json, type RequestHandler } from '@sveltejs/kit';

import { getAgentDiscoveryDocument } from '$lib/agent-gateway/discovery';
import { resolveRequestBaseUrl } from '$lib/server/request-base-url';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const domain = url.searchParams.get('domain')?.trim().toLowerCase() || undefined;
		const serverBaseUrl = resolveRequestBaseUrl(request, url);
		const discovery = await getAgentDiscoveryDocument({ domain, serverBaseUrl });
		return json(discovery, { status: 200 });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error ?? 'unknown_error');
		return json({ ok: false, error: 'agent_discovery_failed', message }, { status: 500 });
	}
};

import { json, type RequestHandler } from '@sveltejs/kit';

import { getAgentToolDetailDocument } from '$lib/agent-gateway/discovery';
import { resolveRequestBaseUrl } from '$lib/server/request-base-url';

type ToolParams = {
	toolId?: string;
};

export const GET: RequestHandler<ToolParams> = async ({ params, request, url }) => {
	const toolId = params.toolId?.trim().toLowerCase();
	if (!toolId) {
		return json({ ok: false, error: 'missing_tool_id' }, { status: 400 });
	}

	try {
		const serverBaseUrl = resolveRequestBaseUrl(request, url);
		const detail = await getAgentToolDetailDocument({ toolId, serverBaseUrl });
		if (!detail) {
			return json({ ok: false, error: 'tool_not_found', toolId }, { status: 404 });
		}
		return json(detail, { status: 200 });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error ?? 'unknown_error');
		return json({ ok: false, error: 'tool_detail_failed', message }, { status: 500 });
	}
};

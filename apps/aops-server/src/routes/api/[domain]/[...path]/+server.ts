import { createSvelteKitPluginHandler } from '@aopslab/host-adapter-sveltekit';
import { json, type RequestHandler } from '@sveltejs/kit';

import { getHostPluginRegistry } from '$lib/host-plugins/registry';
import { inferFailureStatusFromPayload, normalizePluginFailure } from '$lib/server/plugin-error-normalize';
import { attachResolvedProjectScope, resolveHostRequestContext } from '$lib/server/request-context';

const handler = createSvelteKitPluginHandler(getHostPluginRegistry, {
	resolveContext: (event) => resolveHostRequestContext(event)
});
const SAFE_RUNTIME_ERROR_MESSAGE = 'Runtime operation failed. Check server logs for details.';
const NON_JSON_ERROR_TEXT_LIMIT = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function normalizePluginErrorResponse(response: Response): Promise<Response> {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	if (!contentType.includes('application/json')) {
		if (response.status < 400) return response;

		let rawText = '';
		try {
			rawText = String(await response.clone().text());
		} catch {
			rawText = '';
		}
		const rawMessage = rawText.trim();
		const normalizedRawMessage =
			rawMessage.length > NON_JSON_ERROR_TEXT_LIMIT
				? `${rawMessage.slice(0, NON_JSON_ERROR_TEXT_LIMIT)}...`
				: rawMessage;

		const safeMessage =
			response.status === 401
				? 'Unauthorized'
				: response.status === 403
					? 'Forbidden'
					: response.status === 404
						? 'Record not found'
						: SAFE_RUNTIME_ERROR_MESSAGE;

		console.warn('[api-domain] normalized non-json error response', {
			status: response.status,
			statusText: response.statusText,
			contentType,
			rawMessage: normalizedRawMessage
		});

		const headers = new Headers(response.headers);
		headers.delete('content-length');
		headers.delete('content-encoding');
		headers.delete('transfer-encoding');
		headers.set('content-type', 'application/json; charset=utf-8');
		return new Response(
			JSON.stringify({
				ok: false,
				error: 'plugin_response_invalid',
				message: safeMessage
			}),
			{
				status: response.status,
				headers
			}
		);
	}

	let payload: unknown;
	try {
		payload = await response.clone().json();
	} catch {
		return response;
	}

	const normalized = normalizePluginFailure(response.status, payload);
	let nextStatus = normalized.status;
	let nextPayload: unknown = normalized.payload;

	if (normalized.sanitized) {
		const details = isRecord(normalized.payload) ? normalized.payload : {};
		console.warn('[api-domain] sanitized plugin error response', {
			domain: String(details.domain ?? ''),
			operation: String(details.operation ?? ''),
			errorCode: String(details.errorCode ?? ''),
			message: normalized.originalMessage ?? ''
		});
	}

	if (nextStatus < 400) {
		const inferredStatus = inferFailureStatusFromPayload(nextPayload, nextStatus);
		if (inferredStatus !== nextStatus) {
			const details = isRecord(nextPayload) ? nextPayload : {};
			console.warn('[api-domain] remapped semantic failure response', {
				domain: String(details.domain ?? ''),
				operation: String(details.operation ?? ''),
				errorCode: String(details.errorCode ?? ''),
				fromStatus: nextStatus,
				toStatus: inferredStatus
			});
			nextStatus = inferredStatus;
		}
	}

	if (!normalized.sanitized && nextStatus === response.status) return response;

	const headers = new Headers(response.headers);
	headers.delete('content-length');
	headers.delete('content-encoding');
	headers.delete('transfer-encoding');
	return new Response(JSON.stringify(nextPayload), {
		status: nextStatus,
		headers
	});
}

const wrappedHandler: RequestHandler = async (event) => {
	await attachResolvedProjectScope(event);
	const domain = String(event.params.domain ?? '').trim().toLowerCase();
	const requestPath = event.url.pathname;
	const allowedDomains = new Set(["sys","agentspace","docman","projectman","chatv3"]);
	if (!allowedDomains.has(domain)) {
		return json({ ok: false, error: 'domain_not_available', domain }, { status: 404 });
	}


	try {
		const response = await handler(event);
		return normalizePluginErrorResponse(response);
	} catch (error) {
		console.error('[api-domain] handler execution failed', {
			domain,
			method: event.request.method,
			path: requestPath,
			message: error instanceof Error ? error.message : String(error ?? 'unknown_error')
		});
		return json(
			{
				ok: false,
				error: 'domain_route_failed',
				domain,
				message: SAFE_RUNTIME_ERROR_MESSAGE
			},
			{ status: 500 }
		);
	}
};

export const GET = wrappedHandler;
export const POST = wrappedHandler;
export const PUT = wrappedHandler;
export const PATCH = wrappedHandler;
export const DELETE = wrappedHandler;
export const OPTIONS = wrappedHandler;
export const HEAD = wrappedHandler;

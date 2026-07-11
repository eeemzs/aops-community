import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import { getAgentGateway } from '$lib/agent-gateway-runtime';
import {
	classifyInvokeFailureMessage,
	inferFailureStatusFromPayload,
	normalizePluginFailure
} from '$lib/server/plugin-error-normalize';
import { attachResolvedProjectScope, resolveHostRequestContext } from '$lib/server/request-context';

type ToolInvokeParams = {
	toolId?: string;
};

const invokeEnvelopeSchema = z
	.object({
		sourceId: z.string().trim().min(1).optional(),
		input: z.unknown().optional(),
		preview: z.boolean().optional(),
		apply: z.boolean().optional(),
		confirm: z.boolean().optional(),
		idempotencyKey: z.string().trim().min(1).max(200).optional()
	})
	.strict();

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? 'unknown_error');
}

function sanitizeInvokeHeaders(input?: Record<string, string>): Headers {
	const headers = new Headers();
	if (!input) return headers;

	for (const [nameRaw, value] of Object.entries(input)) {
		const name = nameRaw.trim().toLowerCase();
		if (!name) continue;
		if (
			name === 'content-length' ||
			name === 'content-type' ||
			name === 'transfer-encoding' ||
			name === 'connection' ||
			name === 'keep-alive' ||
			name === 'content-encoding'
		) {
			continue;
		}
		headers.set(name, value);
	}

	return headers;
}

function hasClientProvidedContext(input: unknown): boolean {
	return isRecord(input) && Object.prototype.hasOwnProperty.call(input, 'context');
}

function resolveActivitySourceKind(event: RequestEvent<ToolInvokeParams>): 'aops-cli' | 'desktop' | 'runner' | 'system' {
	const candidate = String(event.request.headers.get('x-activity-source-kind') ?? '').trim().toLowerCase();
	if (candidate === 'aops-cli' || candidate === 'desktop' || candidate === 'runner' || candidate === 'system') {
		return candidate;
	}
	return 'system';
}

async function parseInvokePayload(
	event: RequestEvent<ToolInvokeParams>
): Promise<
	| {
			ok: true;
			sourceId?: string;
			input: unknown;
			preview?: boolean;
			apply?: boolean;
			confirm?: boolean;
			idempotencyKey?: string;
	  }
	| { ok: false; error: string; message: string }
> {
	try {
		const rawText = await event.request.text();
		if (!rawText.trim()) {
			return { ok: true, input: undefined };
		}

		const rawPayload = JSON.parse(rawText) as unknown;
		const shouldParseEnvelope =
			isRecord(rawPayload) &&
			(
				('input' in rawPayload ||
					'preview' in rawPayload ||
					'apply' in rawPayload ||
					'confirm' in rawPayload ||
					'idempotencyKey' in rawPayload) ||
				Object.keys(rawPayload).every(
					(key) =>
						key === 'sourceId' ||
						key === 'input' ||
						key === 'preview' ||
						key === 'apply' ||
						key === 'confirm' ||
						key === 'idempotencyKey'
				));

		if (!shouldParseEnvelope) {
			if (hasClientProvidedContext(rawPayload)) {
				return {
					ok: false,
					error: 'invalid_input',
					message: 'invalid_invoke_payload:context_not_allowed'
				};
			}
			return { ok: true, input: rawPayload };
		}

		const parsedEnvelope = invokeEnvelopeSchema.safeParse(rawPayload);
		if (!parsedEnvelope.success) {
			return {
				ok: false,
				error: 'invalid_input',
				message: `invalid_invoke_payload:${parsedEnvelope.error.issues[0]?.message ?? 'invalid_envelope'}`
			};
		}

		if (hasClientProvidedContext(parsedEnvelope.data.input)) {
			return {
				ok: false,
				error: 'invalid_input',
				message: 'invalid_invoke_payload:input.context_not_allowed'
			};
		}

		return {
			ok: true,
			sourceId: parsedEnvelope.data.sourceId?.trim().toLowerCase(),
			input: parsedEnvelope.data.input,
			preview: parsedEnvelope.data.preview,
			apply: parsedEnvelope.data.apply,
			confirm: parsedEnvelope.data.confirm,
			idempotencyKey: parsedEnvelope.data.idempotencyKey?.trim()
		};
	} catch {
		return {
			ok: false,
			error: 'invalid_input',
			message: 'invalid_json_body'
		};
	}
}

export const POST: RequestHandler<ToolInvokeParams> = async (event) => {
	await attachResolvedProjectScope(event);

	const toolId = event.params.toolId?.trim().toLowerCase();
	if (!toolId) {
		return json({ ok: false, error: 'missing_tool_id' }, { status: 400 });
	}

	const gateway = getAgentGateway();
	const parsedPayload = await parseInvokePayload(event);
	if (!parsedPayload.ok) {
		return json({ ok: false, error: parsedPayload.error, message: parsedPayload.message }, { status: 400 });
	}


	try {
		const result = await gateway.invokeTool({
			toolId,
			sourceId: parsedPayload.sourceId,
			input: parsedPayload.input,
			preview: parsedPayload.preview,
			apply: parsedPayload.apply,
			confirm: parsedPayload.confirm,
			idempotencyKey: parsedPayload.idempotencyKey,
			context: {
				...resolveHostRequestContext(event),
				activitySourceKind: resolveActivitySourceKind(event)
			}
		});
		const normalized = normalizePluginFailure(result.status, result.data);
		if (normalized.sanitized) {
			const details =
				normalized.payload && typeof normalized.payload === 'object' && !Array.isArray(normalized.payload)
					? (normalized.payload as Record<string, unknown>)
					: {};
			console.warn('[agent-invoke] sanitized plugin error response', {
				toolId,
				errorCode: String(details.errorCode ?? ''),
				domain: String(details.domain ?? ''),
				operation: String(details.operation ?? ''),
				message: normalized.originalMessage ?? ''
			});
		}
		const effectiveStatus = inferFailureStatusFromPayload(normalized.payload, normalized.status);
		const payloadOk = isRecord(normalized.payload) ? normalized.payload.ok !== false : true;
		const responseOk = effectiveStatus < 400 && payloadOk;

		return json(
			{
				ok: responseOk,
				tool: result.tool,
				data: normalized.payload,
				response: normalized.payload
			},
			{ status: effectiveStatus, headers: sanitizeInvokeHeaders(result.headers) }
		);
	} catch (error) {
		const message = normalizeErrorMessage(error);
		// Route must delegate token/status classification to the shared server normalizer.
		const classification = classifyInvokeFailureMessage(message);
		return json(
			{ ok: false, error: classification.error, message },
			{ status: classification.status }
		);
	}
};

import { classifyInvokeFailureMessage as classifyInvokeFailureMessageFromCatalog } from '@aops/error-catalog/classification';

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
	return String(value ?? '').trim();
}

function normalizeErrorMessageValue(message: string): string {
	return toText(message).toLowerCase();
}

const INPUT_FAILURE_CODE_PREFIXES = [
	'plugin_execution_failed.missing_',
	'plugin_execution_failed.missing_required_',
	'plugin_execution_failed.invalid_',
	'plugin_execution_failed.tool_input_schema_invalid',
	'plugin_execution_failed.unknown_input_',
	'plugin_execution_failed.invalid_input',
	'plugin_execution_failed.validation'
];

const INPUT_FAILURE_MESSAGE_PATTERNS = [
	/missing_required_arg:/i,
	/\bmissing_[a-z0-9_]+/i,
	/unknown_input_arg:/i,
	/tool_input_schema_invalid:/i,
	/\binvalid input\b/i,
	/\bvalidation\b/i,
	/pages cannot be nested under another page/i,
	/sections can only be nested under other sections/i,
	/selected parent section could not be resolved/i,
	/document structure link id is required/i
];

const NOT_FOUND_MESSAGE_PATTERN = /record not found|not[_\s-]?found/i;

const UNSAFE_RUNTIME_MESSAGE_PATTERNS = [
	/failed query:/i,
	/\bparams:\s*\[/i,
	/\binsert into\b/i,
	/\bupdate\b.+\bset\b/i,
	/\bdelete from\b/i,
	/\bselect\b.+\bfrom\b/i,
	/\bsqlite/i,
	/\bpostgres/i,
	/\bdrizzle/i,
	// repository/runtime internals that must not reach clients (e.g. typed
	// not-found errors arriving as "Unexpected error in findById: ...").
	/\bfind_?by[a-z]*\b/i,
	/\bunexpected error\b/i,
	/\brepository\b/i
];

const CONFLICT_MESSAGE_PATTERNS = [
	/conflict/i,
	/already exists/i,
	/duplicate/i,
	/unique/i,
	/expectedPreviousVersionId mismatch/i
];

function isPluginExecutionFailure(payload: Record<string, unknown>): boolean {
	const errorCode = toText(payload.errorCode).toLowerCase();
	const error = toText(payload.error).toLowerCase();
	return errorCode.startsWith('plugin_execution_failed') || error === 'plugin_execution_failed';
}

function isInputFailure(errorCode: string, message: string): boolean {
	if (INPUT_FAILURE_CODE_PREFIXES.some((prefix) => errorCode.startsWith(prefix))) return true;
	return INPUT_FAILURE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export type InvokeFailureClassification = {
	status: number;
	error: string;
};

// Single owner for invoke-level error token classification.
export function classifyInvokeFailureMessage(message: string): InvokeFailureClassification {
	const classification = classifyInvokeFailureMessageFromCatalog(message);
	return {
		status: classification.status,
		error: classification.error
	};
}

function isNotFoundFailure(errorCode: string, message: string): boolean {
	if (errorCode.endsWith('.not_found')) return true;
	return NOT_FOUND_MESSAGE_PATTERN.test(message);
}

function isUnauthorizedFailure(errorCode: string, message: string): boolean {
	if (errorCode.endsWith('.unauthorized')) return true;
	return message.toLowerCase() === 'unauthorized';
}

function isForbiddenFailure(errorCode: string, message: string): boolean {
	if (errorCode.endsWith('.forbidden')) return true;
	return message.toLowerCase() === 'forbidden';
}

function isConflictFailure(errorCode: string, message: string): boolean {
	if (errorCode.endsWith('.conflict')) return true;
	return CONFLICT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function isUnsafeRuntimeMessage(message: string): boolean {
	return UNSAFE_RUNTIME_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function canonicalizePluginErrorCode(errorCode: string, message: string): string {
	if (!errorCode.startsWith('plugin_execution_failed')) return errorCode;
	if (errorCode.endsWith('.conflict')) return errorCode;
	if (isConflictFailure(errorCode, message)) return 'plugin_execution_failed.conflict';
	if (errorCode.endsWith('.not_found')) return errorCode;
	if (isNotFoundFailure(errorCode, message)) return 'plugin_execution_failed.not_found';
	if (errorCode.endsWith('.validation') || errorCode.endsWith('.invalid_input')) return errorCode;
	if (isInputFailure(errorCode, message)) return 'plugin_execution_failed.invalid_input';
	if (errorCode.endsWith('.unauthorized')) return errorCode;
	if (isUnauthorizedFailure(errorCode, message)) return 'plugin_execution_failed.unauthorized';
	if (errorCode.endsWith('.forbidden')) return errorCode;
	if (isForbiddenFailure(errorCode, message)) return 'plugin_execution_failed.forbidden';
	return errorCode;
}

type KnownFailure = {
	status: number;
	errorCode?: string;
	message: string;
};

function resolveKnownFailure(payload: Record<string, unknown>, message: string): KnownFailure | null {
	const domain = toText(payload.domain).toLowerCase();
	const operation = toText(payload.operation).toLowerCase();

	if (domain === 'projectman' && operation === 'kanban-board.create') {
		const hasBoardInsertSql = /\binsert into\s+"projectman_kanban_boards"/i.test(message);
		const hasLikelyInputFailure = /invalid input syntax|foreign key|not-null|null value|check constraint/i.test(
			message
		);
		if (hasBoardInsertSql && !hasLikelyInputFailure) {
			return {
				status: 409,
				errorCode: 'plugin_execution_failed.conflict',
				message: 'Kanban board already exists in this project (same name or position).'
			};
		}
	}

	return null;
}

function resolveSafePluginMessage(errorCode: string, message: string): string {
	// Typed-error messages must stay clean and must never leak raw runtime
	// internals (SQL text, drizzle/repo wording). When the underlying message
	// carries unsafe runtime detail, fall back to the typed constant instead of
	// returning the raw text; otherwise preserve the domain's clean message.
	const unsafe = isUnsafeRuntimeMessage(message);
	if (isUnauthorizedFailure(errorCode, message)) return unsafe ? 'Unauthorized' : message || 'Unauthorized';
	if (isForbiddenFailure(errorCode, message)) return unsafe ? 'Forbidden' : message || 'Forbidden';
	if (isNotFoundFailure(errorCode, message)) return unsafe ? 'Record not found' : message || 'Record not found';
	if (isConflictFailure(errorCode, message)) return unsafe ? 'Conflict' : message || 'Conflict';
	if (isInputFailure(errorCode, message)) return unsafe ? 'Invalid input' : message || 'Invalid input';
	if (!message) return 'Runtime operation failed. Check server logs for details.';
	if (errorCode.startsWith('plugin_execution_failed.runtime') || unsafe) {
		return 'Runtime operation failed. Check server logs for details.';
	}
	return message;
}

export function inferFailureStatusFromPayload(payload: unknown, fallbackStatus: number): number {
	if (!isRecord(payload) || payload.ok !== false) return fallbackStatus;

	const errorCode = toText(payload.errorCode).toLowerCase();
	const message = normalizeErrorMessageValue(toText(payload.message));

	if (
		errorCode.endsWith('.not_found') ||
		/record not found/i.test(message) ||
		/not[_\s-]?found/i.test(message)
	) {
		return 404;
	}
	if (errorCode.endsWith('.unauthorized') || message === 'unauthorized') return 401;
	if (errorCode.endsWith('.forbidden') || message === 'forbidden') return 403;
	if (errorCode.endsWith('.conflict') || /conflict|already exists|duplicate|unique/i.test(message)) return 409;
	if (errorCode.endsWith('.rate_limit') || /rate limit|too many requests|too many attempts/i.test(message)) return 429;
	if (errorCode.endsWith('.service_unavailable')) return 503;
	if (errorCode.endsWith('.invalid_input') || errorCode.endsWith('.validation') || isInputFailure(errorCode, message)) {
		return 400;
	}

	return fallbackStatus < 400 ? 500 : fallbackStatus;
}

export type PluginFailureNormalization = {
	status: number;
	payload: unknown;
	sanitized: boolean;
	originalMessage?: string;
	safeMessage?: string;
};

export function normalizePluginFailure(status: number, payload: unknown): PluginFailureNormalization {
	if (!isRecord(payload) || !isPluginExecutionFailure(payload)) {
		return { status, payload, sanitized: false };
	}

	const errorCode = toText(payload.errorCode).toLowerCase();
	const message = toText(payload.message);
	const knownFailure = resolveKnownFailure(payload, message);

	let mappedStatus = knownFailure?.status ?? status;
	const effectiveErrorCode = canonicalizePluginErrorCode(
		knownFailure?.errorCode ?? errorCode,
		knownFailure?.message ?? message
	);
	const effectiveMessage = knownFailure?.message ?? message;
	if (status === 500) {
		if (isNotFoundFailure(effectiveErrorCode, effectiveMessage)) {
			mappedStatus = 404;
		} else if (isConflictFailure(effectiveErrorCode, effectiveMessage)) {
			mappedStatus = 409;
		} else if (isInputFailure(effectiveErrorCode, effectiveMessage)) {
			mappedStatus = 400;
		} else if (isUnauthorizedFailure(effectiveErrorCode, effectiveMessage)) {
			mappedStatus = 401;
		} else if (isForbiddenFailure(effectiveErrorCode, effectiveMessage)) {
			mappedStatus = 403;
		}
	}

	const safeMessage = resolveSafePluginMessage(effectiveErrorCode, effectiveMessage);
	const shouldSetErrorCode = toText(payload.errorCode) !== effectiveErrorCode;
	const sanitized = safeMessage !== message || shouldSetErrorCode;
	const nextPayload = sanitized
		? {
				...payload,
				errorCode: effectiveErrorCode,
				message: safeMessage
			}
		: payload;

	return {
		status: mappedStatus,
		payload: nextPayload,
		sanitized,
		originalMessage: message || undefined,
		safeMessage: safeMessage || undefined
	};
}

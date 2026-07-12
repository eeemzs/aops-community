const toText = (value) => String(value ?? "").trim();

export const KNOWN_ERROR_CODES = Object.freeze({
  TOOL_NOT_FOUND: "tool_not_found",
  PROJECT_CONTEXT_REQUIRED: "project_context_required",
  APPLY_REQUIRED: "apply_required",
  CONFIRMATION_REQUIRED: "confirmation_required",
  TOOL_INPUT_SCHEMA_INVALID: "tool_input_schema_invalid",
  INVALID_INPUT: "invalid_input",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  TOOL_INVOKE_FAILED: "tool_invoke_failed"
});

export const PROJECT_CONTEXT_ERROR_HINTS = Object.freeze([
  "project_required",
  "project_context_required",
  "project_scope_required",
  "missing_project_context"
]);

export const TOOL_NOT_FOUND_HINTS = Object.freeze([
  "tool_not_found",
  "tool_not_resolved:",
  "tool_source_not_found:",
  "tool_source_unavailable:",
  "operation_route_not_found:"
]);

export const APPLY_REQUIRED_HINTS = Object.freeze([
  "apply_required",
  "apply_required:"
]);

export const CONFIRMATION_REQUIRED_HINTS = Object.freeze([
  "confirmation_required",
  "confirmation_required:"
]);

export const INVALID_INPUT_PREFIX_HINTS = Object.freeze([
  "missing_required_arg:",
  "unknown_input_arg:",
  "tool_input_schema_invalid:"
]);

export const INVALID_INPUT_GENERIC_HINTS = Object.freeze([
  "validation_failed",
  "invalid_input"
]);

export const normalizeErrorMessage = (message) => toText(message).toLowerCase();

const includesAnyHint = (normalizedMessage, hints) =>
  hints.some((hint) => normalizedMessage.includes(String(hint ?? "").toLowerCase()));

export const resolveKnownErrorCodeFromMessage = (message) => {
  const normalizedMessage = normalizeErrorMessage(message);
  if (!normalizedMessage) return "";

  if (includesAnyHint(normalizedMessage, TOOL_NOT_FOUND_HINTS)) {
    return KNOWN_ERROR_CODES.TOOL_NOT_FOUND;
  }

  if (includesAnyHint(normalizedMessage, PROJECT_CONTEXT_ERROR_HINTS)) {
    return KNOWN_ERROR_CODES.PROJECT_CONTEXT_REQUIRED;
  }

  if (includesAnyHint(normalizedMessage, APPLY_REQUIRED_HINTS)) {
    return KNOWN_ERROR_CODES.APPLY_REQUIRED;
  }

  if (includesAnyHint(normalizedMessage, CONFIRMATION_REQUIRED_HINTS)) {
    return KNOWN_ERROR_CODES.CONFIRMATION_REQUIRED;
  }

  if (normalizedMessage.startsWith("tool_input_schema_invalid:")) {
    return KNOWN_ERROR_CODES.TOOL_INPUT_SCHEMA_INVALID;
  }

  if (INVALID_INPUT_PREFIX_HINTS.some((prefix) => normalizedMessage.startsWith(prefix))) {
    return KNOWN_ERROR_CODES.INVALID_INPUT;
  }

  if (includesAnyHint(normalizedMessage, INVALID_INPUT_GENERIC_HINTS)) {
    return KNOWN_ERROR_CODES.INVALID_INPUT;
  }

  if (normalizedMessage === KNOWN_ERROR_CODES.UNAUTHORIZED) {
    return KNOWN_ERROR_CODES.UNAUTHORIZED;
  }

  if (normalizedMessage === KNOWN_ERROR_CODES.FORBIDDEN) {
    return KNOWN_ERROR_CODES.FORBIDDEN;
  }

  return "";
};

export const classifyInvokeFailureMessage = (message) => {
  const errorCode = resolveKnownErrorCodeFromMessage(message);

  if (errorCode === KNOWN_ERROR_CODES.TOOL_NOT_FOUND) {
    return { status: 404, error: KNOWN_ERROR_CODES.TOOL_NOT_FOUND };
  }

  if (errorCode === KNOWN_ERROR_CODES.PROJECT_CONTEXT_REQUIRED) {
    return { status: 409, error: KNOWN_ERROR_CODES.PROJECT_CONTEXT_REQUIRED };
  }

  if (errorCode === KNOWN_ERROR_CODES.APPLY_REQUIRED) {
    return { status: 409, error: KNOWN_ERROR_CODES.APPLY_REQUIRED };
  }

  if (errorCode === KNOWN_ERROR_CODES.CONFIRMATION_REQUIRED) {
    return { status: 409, error: KNOWN_ERROR_CODES.CONFIRMATION_REQUIRED };
  }

  if (
    errorCode === KNOWN_ERROR_CODES.INVALID_INPUT ||
    errorCode === KNOWN_ERROR_CODES.TOOL_INPUT_SCHEMA_INVALID
  ) {
    return { status: 400, error: KNOWN_ERROR_CODES.INVALID_INPUT };
  }

  if (errorCode === KNOWN_ERROR_CODES.UNAUTHORIZED) {
    return { status: 401, error: KNOWN_ERROR_CODES.UNAUTHORIZED };
  }

  if (errorCode === KNOWN_ERROR_CODES.FORBIDDEN) {
    return { status: 403, error: KNOWN_ERROR_CODES.FORBIDDEN };
  }

  return { status: 500, error: KNOWN_ERROR_CODES.TOOL_INVOKE_FAILED };
};

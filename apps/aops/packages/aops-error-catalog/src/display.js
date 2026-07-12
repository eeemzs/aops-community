import { KNOWN_ERROR_CODES, normalizeErrorMessage } from "./classification.js";

const toText = (value) => String(value ?? "").trim();

export const resolveKnownErrorDisplayMessage = (errorCode, options = {}) => {
  const normalizedCode = normalizeErrorMessage(errorCode);
  const unauthorizedMessage = toText(options?.unauthorizedMessage);

  if (normalizedCode === KNOWN_ERROR_CODES.PROJECT_CONTEXT_REQUIRED) {
    return "Project context is required for this operation. Select a project and try again. (project_context_required)";
  }

  if (normalizedCode === KNOWN_ERROR_CODES.APPLY_REQUIRED) {
    return "This operation is write-protected. Retry with explicit apply approval. (apply_required)";
  }

  if (normalizedCode === KNOWN_ERROR_CODES.CONFIRMATION_REQUIRED) {
    return "This destructive operation also requires explicit confirmation. Retry with confirm approval. (confirmation_required)";
  }

  if (normalizedCode === KNOWN_ERROR_CODES.TOOL_NOT_FOUND) {
    return "Requested tool was not found on the server. If you just synced a manifest, run `aops-cli host diagnostics --reset --warmup` and retry. (tool_not_found)";
  }

  if (normalizedCode === KNOWN_ERROR_CODES.TOOL_INPUT_SCHEMA_INVALID) {
    return "Tool input schema is invalid. Check input field names and value types. (tool_input_schema_invalid)";
  }

  if (normalizedCode === KNOWN_ERROR_CODES.INVALID_INPUT) {
    return "Input validation failed. Check required fields and value formats. (validation_failed)";
  }

  if (normalizedCode === KNOWN_ERROR_CODES.UNAUTHORIZED) {
    return unauthorizedMessage || "Sign in to continue. (unauthorized)";
  }

  if (normalizedCode === KNOWN_ERROR_CODES.FORBIDDEN) {
    return "You do not have permission to run this operation in the current runtime context. (forbidden)";
  }

  return "";
};

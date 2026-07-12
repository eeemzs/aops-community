export type KnownErrorCode =
  | "tool_not_found"
  | "project_context_required"
  | "apply_required"
  | "confirmation_required"
  | "tool_input_schema_invalid"
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "tool_invoke_failed";

export declare const KNOWN_ERROR_CODES: Readonly<{
  TOOL_NOT_FOUND: "tool_not_found";
  PROJECT_CONTEXT_REQUIRED: "project_context_required";
  APPLY_REQUIRED: "apply_required";
  CONFIRMATION_REQUIRED: "confirmation_required";
  TOOL_INPUT_SCHEMA_INVALID: "tool_input_schema_invalid";
  INVALID_INPUT: "invalid_input";
  UNAUTHORIZED: "unauthorized";
  FORBIDDEN: "forbidden";
  TOOL_INVOKE_FAILED: "tool_invoke_failed";
}>;

export declare const PROJECT_CONTEXT_ERROR_HINTS: ReadonlyArray<string>;
export declare const TOOL_NOT_FOUND_HINTS: ReadonlyArray<string>;
export declare const APPLY_REQUIRED_HINTS: ReadonlyArray<string>;
export declare const CONFIRMATION_REQUIRED_HINTS: ReadonlyArray<string>;
export declare const INVALID_INPUT_PREFIX_HINTS: ReadonlyArray<string>;
export declare const INVALID_INPUT_GENERIC_HINTS: ReadonlyArray<string>;

export declare const normalizeErrorMessage: (message: unknown) => string;

export declare const resolveKnownErrorCodeFromMessage: (message: unknown) => KnownErrorCode | "";

export declare const classifyInvokeFailureMessage: (
  message: unknown
) => {
  status: number;
  error: KnownErrorCode;
};

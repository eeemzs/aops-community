import { Effect } from 'effect'
import {
  type XfValidationError,
  type XfInputRequiredError,
  type XfInputRequiredErrorFields,
  XfErrorFactory,
} from '@aopslab/xf-core'
import { zodErrorToXfResultLegacy } from '@aopslab/xf-validation'
import type { ZodTypeAny } from 'zod'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Presence + uuid-shape guard for id inputs that resolve against a uuid primary
 * key. Use in place of `validateInput(id, 'id', ...)` for by-id ops
 * (getById/update/remove/addResult). A non-uuid value — e.g. the 8-char short
 * id agents copy from list/create — must never reach the uuid column: Postgres
 * rejects the cast and the error escapes the Effect failure channel as an
 * unhandled defect, surfacing as an opaque `plugin_execution_failed.runtime`
 * 500. Failing here with the same XfInputRequiredError that `validateInput`
 * already produces keeps the error in the Effect failure channel; the
 * "Validation failed" message prefix makes the host dispatcher classify it as
 * `plugin_execution_failed.validation` (a recognized client-input reason) rather
 * than the opaque `runtime` fallback. (All projectman Postgres ids are uuid;
 * SQLite ids are uuid-shaped, so a well-formed-uuid filter never excludes a real
 * record.)
 */
export const validateUuidInput = (
  value: string | undefined,
  field: string,
  params: Omit<XfInputRequiredErrorFields, 'field' | 'message'>
): Effect.Effect<string, XfInputRequiredError> => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) {
    return Effect.fail(
      XfErrorFactory.inputRequired({ ...params, field, message: `Validation failed for ${field}: ${field} is required` })
    )
  }
  if (!UUID_PATTERN.test(trimmed)) {
    return Effect.fail(
      XfErrorFactory.inputRequired({ ...params, field, message: `Validation failed for ${field}: must be a well-formed uuid` })
    )
  }
  return Effect.succeed(trimmed)
}

export type ValidateBmInputWithSchemaOptions<TInput> = {
  input: TInput
  schema: ZodTypeAny
  stage: string
  operation: string
  field: string
}

export const validateBmInputWithSchema = <TInput>({
  input,
  schema,
  stage,
  operation,
  field,
}: ValidateBmInputWithSchemaOptions<TInput>): Effect.Effect<TInput, XfValidationError> => {
  const validation = schema.safeParse(input)
  if (validation.success) {
    return Effect.succeed(input)
  }

  return Effect.fail(
    XfErrorFactory.xfValidationFailed(
      zodErrorToXfResultLegacy(validation.error, stage),
      {
        stage,
        operation,
        message: `Validation failed for ${field}`,
      },
      input
    )
  )
}

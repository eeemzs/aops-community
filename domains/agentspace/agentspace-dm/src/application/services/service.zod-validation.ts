import { Effect } from 'effect'
import { type XfValidationError, XfErrorFactory } from '@aopslab/xf-core'
import { zodErrorToXfResultLegacy } from '@aopslab/xf-validation'
import type { ZodTypeAny } from 'zod'

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

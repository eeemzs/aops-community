import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { reviewRequestResultZodSchema, reviewRequestZodSchema, reviewRequestZodSchemaInsert } from './zod.schema.js'

export type IbmReviewRequestResult = z.infer<typeof reviewRequestResultZodSchema>
export type IbmReviewRequest = z.infer<typeof reviewRequestZodSchema>
export type IbmReviewRequestInsert = z.infer<typeof reviewRequestZodSchemaInsert>

export const ibmReviewRequestKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'sprintId',
  'kanbanTaskId',
  'microTaskItemId',
  'collabSessionId',
  'collabRequestEventId',
  'collabResultEventIds',
  'parentReviewRequestId',
  'rootReviewRequestId',
  'title',
  'description',
  'reviewScope',
  'instructions',
  'references',
  'status',
  'priority',
  'source',
  'tags',
  'requestedBy',
  'targetAgent',
  'targetSlot',
  'results',
  'idempotencyKey',
  'notes',
  'meta',
  'requestedAt',
  'closedAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmReviewRequest)[]

type _VerifyKeys = EnsureAllKeys<IbmReviewRequest, typeof ibmReviewRequestKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmReviewRequestMlgKeys = DotNestedMlgKeys<IbmReviewRequest>

export const bmReviewRequestMlgFields = mlgFieldsOf<IbmReviewRequest>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

type _VerifyMlgFields = EnsureExactMlgKeys<IbmReviewRequest, typeof bmReviewRequestMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

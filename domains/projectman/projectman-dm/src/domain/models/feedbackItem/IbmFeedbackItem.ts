import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { feedbackItemZodSchema, feedbackItemZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmFeedbackItem = z.infer<typeof feedbackItemZodSchema>
export type IbmFeedbackItemInsert = z.infer<typeof feedbackItemZodSchemaInsert>

export const ibmFeedbackItemKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'sprintId',
  'kanbanTaskId',
  'microTaskItemId',
  'title',
  'description',
  'status',
  'type',
  'severity',
  'source',
  'tags',
  'suggestion',
  'notes',
  'meta',
  'recordedAt',
  'handledAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmFeedbackItem)[]

type _VerifyKeys = EnsureAllKeys<IbmFeedbackItem, typeof ibmFeedbackItemKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmFeedbackItemMlgKeys = DotNestedMlgKeys<IbmFeedbackItem>

export const bmFeedbackItemMlgFields = mlgFieldsOf<IbmFeedbackItem>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmFeedbackItem, typeof bmFeedbackItemMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

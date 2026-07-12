import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { sprintZodSchema, sprintZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSprint = z.infer<typeof sprintZodSchema>
export type IbmSprintInsert = z.infer<typeof sprintZodSchemaInsert>

export const ibmSprintKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'kanbanTaskId',
  'name',
  'goal',
  'references',
  'scope',
  'validationPlan',
  'notes',
  'archivedAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmSprint)[]

type _VerifyKeys = EnsureAllKeys<IbmSprint, typeof ibmSprintKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmSprintMlgKeys = DotNestedMlgKeys<IbmSprint>

export const bmSprintMlgFields = mlgFieldsOf<IbmSprint>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmSprint, typeof bmSprintMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

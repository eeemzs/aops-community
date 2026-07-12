import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { sprintGroupZodSchema, sprintGroupZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSprintGroup = z.infer<typeof sprintGroupZodSchema>
export type IbmSprintGroupInsert = z.infer<typeof sprintGroupZodSchemaInsert>

export const ibmSprintGroupKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'sprintId',
  'name',
  'description',
  'position',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmSprintGroup)[]

type _VerifyKeys = EnsureAllKeys<IbmSprintGroup, typeof ibmSprintGroupKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmSprintGroupMlgKeys = DotNestedMlgKeys<IbmSprintGroup>

export const bmSprintGroupMlgFields = mlgFieldsOf<IbmSprintGroup>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmSprintGroup, typeof bmSprintGroupMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

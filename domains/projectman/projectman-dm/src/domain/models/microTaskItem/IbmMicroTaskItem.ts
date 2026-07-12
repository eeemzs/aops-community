import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { microTaskItemZodSchema, microTaskItemZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmMicroTaskItem = z.infer<typeof microTaskItemZodSchema>
export type IbmMicroTaskItemInsert = z.infer<typeof microTaskItemZodSchemaInsert>

export const ibmMicroTaskItemKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'phaseId',
  'title',
  'status',
  'position',
  'notes',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmMicroTaskItem)[]

type _VerifyKeys = EnsureAllKeys<IbmMicroTaskItem, typeof ibmMicroTaskItemKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmMicroTaskItemMlgKeys = DotNestedMlgKeys<IbmMicroTaskItem>

export const bmMicroTaskItemMlgFields = mlgFieldsOf<IbmMicroTaskItem>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmMicroTaskItem, typeof bmMicroTaskItemMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

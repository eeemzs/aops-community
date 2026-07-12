import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { tagZodSchema, tagZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmTag = z.infer<typeof tagZodSchema>
export type IbmTagInsert = z.infer<typeof tagZodSchemaInsert>

export const ibmTagKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'scopeType',
  'name',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmTag)[]

type _VerifyKeys = EnsureAllKeys<IbmTag, typeof ibmTagKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmTagMlgKeys = DotNestedMlgKeys<IbmTag>

export const bmTagMlgFields = mlgFieldsOf<IbmTag>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmTag, typeof bmTagMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

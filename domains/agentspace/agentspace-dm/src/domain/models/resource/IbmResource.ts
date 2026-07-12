import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { resourceZodSchema, resourceZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmResource = z.infer<typeof resourceZodSchema>
export type IbmResourceInsert = z.infer<typeof resourceZodSchemaInsert>

export const ibmResourceKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'name',
  'description',
  'resourceType',
  'uri',
  'tags',
  'refType',
  'refId',
  'createdBy',
  'updatedBy',
  'meta',
] as const satisfies readonly (keyof IbmResource)[]

type _VerifyKeys = EnsureAllKeys<IbmResource, typeof ibmResourceKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmResourceMlgKeys = DotNestedMlgKeys<IbmResource>

export const bmResourceMlgFields = mlgFieldsOf<IbmResource>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmResource, typeof bmResourceMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

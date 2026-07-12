import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { scopeZodSchema, scopeZodSchemaInsert } from './zod.schema.js'

export type IbmScope = z.infer<typeof scopeZodSchema>
export type IbmScopeInsert = z.infer<typeof scopeZodSchemaInsert>

export const ibmScopeKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'type',
  'parentScopeId',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmScope)[]

type _VerifyKeys = EnsureAllKeys<IbmScope, typeof ibmScopeKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmScopeMlgKeys = DotNestedMlgKeys<IbmScope>

export const bmScopeMlgFields = mlgFieldsOf<IbmScope>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmScope, typeof bmScopeMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

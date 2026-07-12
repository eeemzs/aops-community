import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { taskRelationZodSchema, taskRelationZodSchemaInsert } from './zod.schema.js'

export type IbmTaskRelation = z.infer<typeof taskRelationZodSchema>
export type IbmTaskRelationInsert = z.infer<typeof taskRelationZodSchemaInsert>

export const ibmTaskRelationKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'fromTaskId',
  'toTaskId',
  'kind',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmTaskRelation)[]

type _VerifyKeys = EnsureAllKeys<IbmTaskRelation, typeof ibmTaskRelationKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmTaskRelationMlgKeys = DotNestedMlgKeys<IbmTaskRelation>
export const bmTaskRelationMlgFields = mlgFieldsOf<IbmTaskRelation>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmTaskRelation, typeof bmTaskRelationMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { taskLabelZodSchema, taskLabelZodSchemaInsert } from './zod.schema.js'

export type IbmTaskLabel = z.infer<typeof taskLabelZodSchema>
export type IbmTaskLabelInsert = z.infer<typeof taskLabelZodSchemaInsert>

export const ibmTaskLabelKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'name',
  'color',
  'position',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmTaskLabel)[]

type _VerifyKeys = EnsureAllKeys<IbmTaskLabel, typeof ibmTaskLabelKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmTaskLabelMlgKeys = DotNestedMlgKeys<IbmTaskLabel>
export const bmTaskLabelMlgFields = mlgFieldsOf<IbmTaskLabel>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmTaskLabel, typeof bmTaskLabelMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

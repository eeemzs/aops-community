import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { taskLabelLinkZodSchema, taskLabelLinkZodSchemaInsert } from './zod.schema.js'

export type IbmTaskLabelLink = z.infer<typeof taskLabelLinkZodSchema>
export type IbmTaskLabelLinkInsert = z.infer<typeof taskLabelLinkZodSchemaInsert>

export const ibmTaskLabelLinkKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'taskId',
  'labelId',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmTaskLabelLink)[]

type _VerifyKeys = EnsureAllKeys<IbmTaskLabelLink, typeof ibmTaskLabelLinkKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmTaskLabelLinkMlgKeys = DotNestedMlgKeys<IbmTaskLabelLink>
export const bmTaskLabelLinkMlgFields = mlgFieldsOf<IbmTaskLabelLink>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmTaskLabelLink, typeof bmTaskLabelLinkMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

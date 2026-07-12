import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { taskCommentZodSchema, taskCommentZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmTaskComment = z.infer<typeof taskCommentZodSchema>
export type IbmTaskCommentInsert = z.infer<typeof taskCommentZodSchemaInsert>

export const ibmTaskCommentKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'taskId',
  'author',
  'body',
  'meta'
] as const satisfies readonly (keyof IbmTaskComment)[]

type _VerifyKeys = EnsureAllKeys<IbmTaskComment, typeof ibmTaskCommentKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmTaskCommentMlgKeys = DotNestedMlgKeys<IbmTaskComment>

export const bmTaskCommentMlgFields = mlgFieldsOf<IbmTaskComment>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmTaskComment, typeof bmTaskCommentMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

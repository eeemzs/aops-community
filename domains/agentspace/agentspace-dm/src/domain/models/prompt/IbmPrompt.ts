import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { promptZodSchema, promptZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmPrompt = z.infer<typeof promptZodSchema>
export type IbmPromptInsert = z.infer<typeof promptZodSchemaInsert>

export const ibmPromptKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'name',
  'description',
  'tags',
  'status',
  'currentVersionId',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmPrompt)[]

type _VerifyKeys = EnsureAllKeys<IbmPrompt, typeof ibmPromptKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmPromptMlgKeys = DotNestedMlgKeys<IbmPrompt>

export const bmPromptMlgFields = mlgFieldsOf<IbmPrompt>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmPrompt, typeof bmPromptMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

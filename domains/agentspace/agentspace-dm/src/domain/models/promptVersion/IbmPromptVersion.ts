import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { promptVersionZodSchema, promptVersionZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmPromptVersion = z.infer<typeof promptVersionZodSchema>
export type IbmPromptVersionInsert = z.infer<typeof promptVersionZodSchemaInsert>

export const ibmPromptVersionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'promptId',
  'version',
  'status',
  'content',
  'variables',
  'meta',
  'publishedAt',
  'refType',
  'refId',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmPromptVersion)[]

type _VerifyKeys = EnsureAllKeys<IbmPromptVersion, typeof ibmPromptVersionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmPromptVersionMlgKeys = DotNestedMlgKeys<IbmPromptVersion>

export const bmPromptVersionMlgFields = mlgFieldsOf<IbmPromptVersion>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmPromptVersion, typeof bmPromptVersionMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

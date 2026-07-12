import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { skillVersionZodSchema, skillVersionZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSkillVersion = z.infer<typeof skillVersionZodSchema>
export type IbmSkillVersionInsert = z.infer<typeof skillVersionZodSchemaInsert>

export const ibmSkillVersionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'skillId',
  'version',
  'status',
  'content',
  'entryFile',
  'skillStandard',
  'files',
  'meta',
  'refType',
  'refId',
  'createdBy',
  'updatedBy',
  'publishedAt',
] as const satisfies readonly (keyof IbmSkillVersion)[]

type _VerifyKeys = EnsureAllKeys<IbmSkillVersion, typeof ibmSkillVersionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmSkillVersionMlgKeys = DotNestedMlgKeys<IbmSkillVersion>

export const bmSkillVersionMlgFields = mlgFieldsOf<IbmSkillVersion>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmSkillVersion, typeof bmSkillVersionMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

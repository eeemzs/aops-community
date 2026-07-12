import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { skillZodSchema, skillZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSkill = z.infer<typeof skillZodSchema>
export type IbmSkillInsert = z.infer<typeof skillZodSchemaInsert>

export const ibmSkillKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'name',
  'description',
  'shortDescription',
  'tags',
  'currentVersionId',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmSkill)[]

type _VerifyKeys = EnsureAllKeys<IbmSkill, typeof ibmSkillKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmSkillMlgKeys = DotNestedMlgKeys<IbmSkill>

export const bmSkillMlgFields = mlgFieldsOf<IbmSkill>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmSkill, typeof bmSkillMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { experienceItemZodSchema, experienceItemZodSchemaInsert } from './zod.schema.js'

export type IbmExperienceItem = z.infer<typeof experienceItemZodSchema>
export type IbmExperienceItemInsert = z.infer<typeof experienceItemZodSchemaInsert>

export const ibmExperienceItemKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'type',
  'title',
  'problem',
  'solution',
  'content',
  'areas',
  'stack',
  'commands',
  'files',
  'sourceRefs',
  'tags',
  'confidence',
  'reusability',
  'meta',
] as const satisfies readonly (keyof IbmExperienceItem)[]

type _VerifyKeys = EnsureAllKeys<IbmExperienceItem, typeof ibmExperienceItemKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmExperienceItemMlgKeys = DotNestedMlgKeys<IbmExperienceItem>

export const bmExperienceItemMlgFields = mlgFieldsOf<IbmExperienceItem>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmExperienceItem, typeof bmExperienceItemMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

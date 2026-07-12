import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { sectionZodSchema, sectionZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSection = z.infer<typeof sectionZodSchema>
export type IbmSectionInsert = z.infer<typeof sectionZodSchemaInsert>

export const ibmSectionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'sectionUid',
  'title',
  'titleMl',
  'kind',
  'slug',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmSection)[]

type _VerifyKeys = EnsureAllKeys<IbmSection, typeof ibmSectionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmSectionMlgKeys = DotNestedMlgKeys<IbmSection>

export const bmSectionMlgFields = mlgFieldsOf<IbmSection>()('titleMl')

type _VerifyMlgFields = EnsureExactMlgKeys<IbmSection, typeof bmSectionMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

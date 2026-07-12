import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { projectZodSchema, projectZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmProject = z.infer<typeof projectZodSchema>
export type IbmProjectInsert = z.infer<typeof projectZodSchemaInsert>

export const ibmProjectKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'name',
  'description',
  'tags',
  'slug',
  'status',
  'visibility',
  'projectType',
  'ownerId',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmProject)[]

type _VerifyKeys = EnsureAllKeys<IbmProject, typeof ibmProjectKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmProjectMlgKeys = DotNestedMlgKeys<IbmProject>

export const bmProjectMlgFields = mlgFieldsOf<IbmProject>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmProject, typeof bmProjectMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

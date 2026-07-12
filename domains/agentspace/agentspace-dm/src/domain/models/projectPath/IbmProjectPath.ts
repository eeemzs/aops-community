import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { projectPathZodSchema, projectPathZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmProjectPath = z.infer<typeof projectPathZodSchema>
export type IbmProjectPathInsert = z.infer<typeof projectPathZodSchemaInsert>

export const ibmProjectPathKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'pathKey',
  'path',
  'description',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmProjectPath)[]

type _VerifyKeys = EnsureAllKeys<IbmProjectPath, typeof ibmProjectPathKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export const bmProjectPathMlgFields = mlgFieldsOf<IbmProjectPath>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmProjectPath, typeof bmProjectPathMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

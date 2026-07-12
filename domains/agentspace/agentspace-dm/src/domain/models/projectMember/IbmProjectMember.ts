import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { projectMemberZodSchema, projectMemberZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmProjectMember = z.infer<typeof projectMemberZodSchema>
export type IbmProjectMemberInsert = z.infer<typeof projectMemberZodSchemaInsert>

export const ibmProjectMemberKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'userId',
  'role',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmProjectMember)[]

type _VerifyKeys = EnsureAllKeys<IbmProjectMember, typeof ibmProjectMemberKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmProjectMemberMlgKeys = DotNestedMlgKeys<IbmProjectMember>

export const bmProjectMemberMlgFields = mlgFieldsOf<IbmProjectMember>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmProjectMember, typeof bmProjectMemberMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { projectmanEventZodSchema, projectmanEventZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmProjectmanEvent = z.infer<typeof projectmanEventZodSchema>
export type IbmProjectmanEventInsert = z.infer<typeof projectmanEventZodSchemaInsert>

export const ibmProjectmanEventKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'entityType',
  'entityId',
  'action',
  'payload',
  'actorId',
] as const satisfies readonly (keyof IbmProjectmanEvent)[]

type _VerifyKeys = EnsureAllKeys<IbmProjectmanEvent, typeof ibmProjectmanEventKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmProjectmanEventMlgKeys = DotNestedMlgKeys<IbmProjectmanEvent>

export const bmProjectmanEventMlgFields = mlgFieldsOf<IbmProjectmanEvent>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmProjectmanEvent, typeof bmProjectmanEventMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

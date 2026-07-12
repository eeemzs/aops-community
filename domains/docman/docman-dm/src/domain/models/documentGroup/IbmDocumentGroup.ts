import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { documentGroupZodSchema, documentGroupZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmDocumentGroup = z.infer<typeof documentGroupZodSchema>
export type IbmDocumentGroupInsert = z.infer<typeof documentGroupZodSchemaInsert>

export const ibmDocumentGroupKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'groupUid',
  'parentGroupId',
  'parentGroupUid',
  'title',
  'description',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmDocumentGroup)[]

type _VerifyKeys = EnsureAllKeys<IbmDocumentGroup, typeof ibmDocumentGroupKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { documentVersionZodSchema, documentVersionZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmDocumentVersion = z.infer<typeof documentVersionZodSchema>
export type IbmDocumentVersionInsert = z.infer<typeof documentVersionZodSchemaInsert>

export const ibmDocumentVersionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'documentId',
  'version',
  'label',
  'status',
  'title',
  'summary',
  'releaseNotes',
  'releaseNotesMl',
  'isCurrent',
  'basedOnVersionId',
  'publishedAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmDocumentVersion)[]

type _VerifyKeys = EnsureAllKeys<IbmDocumentVersion, typeof ibmDocumentVersionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmDocumentVersionMlgKeys = DotNestedMlgKeys<IbmDocumentVersion>

export const bmDocumentVersionMlgFields = mlgFieldsOf<IbmDocumentVersion>()('releaseNotesMl')

type _VerifyMlgFields = EnsureExactMlgKeys<IbmDocumentVersion, typeof bmDocumentVersionMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

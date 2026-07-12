import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { documentZodSchema, documentZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmDocument = z.infer<typeof documentZodSchema>
export type IbmDocumentInsert = z.infer<typeof documentZodSchemaInsert>

export const ibmDocumentKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'documentUid',
  'groupId',
  'groupUid',
  'slug',
  'title',
  'titleMl',
  'summary',
  'summaryMl',
  'description',
  'descriptionMl',
  'status',
  'visibility',
  'tags',
  'pageSize',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmDocument)[]

type _VerifyKeys = EnsureAllKeys<IbmDocument, typeof ibmDocumentKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmDocumentMlgKeys = DotNestedMlgKeys<IbmDocument>

export const bmDocumentMlgFields = mlgFieldsOf<IbmDocument>()('titleMl', 'summaryMl', 'descriptionMl', 'meta')

type _VerifyMlgFields = EnsureExactMlgKeys<IbmDocument, typeof bmDocumentMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { pageVersionZodSchema, pageVersionZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmPageVersion = z.infer<typeof pageVersionZodSchema>
export type IbmPageVersionInsert = z.infer<typeof pageVersionZodSchemaInsert>

export const ibmPageVersionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'pageId',
  'version',
  'title',
  'format',
  'content',
  'contentMl',
  'contentData',
  'directives',
  'status',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmPageVersion)[]

type _VerifyKeys = EnsureAllKeys<IbmPageVersion, typeof ibmPageVersionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmPageVersionMlgKeys = DotNestedMlgKeys<IbmPageVersion>

export const bmPageVersionMlgFields = mlgFieldsOf<IbmPageVersion>()('contentMl', 'contentData', 'directives')

type _VerifyMlgFields = EnsureExactMlgKeys<IbmPageVersion, typeof bmPageVersionMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { pageZodSchema, pageZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmPage = z.infer<typeof pageZodSchema>
export type IbmPageInsert = z.infer<typeof pageZodSchemaInsert>

export const ibmPageKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'pageUid',
  'title',
  'titleMl',
  'kind',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmPage)[]

type _VerifyKeys = EnsureAllKeys<IbmPage, typeof ibmPageKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmPageMlgKeys = DotNestedMlgKeys<IbmPage>

export const bmPageMlgFields = mlgFieldsOf<IbmPage>()('titleMl', 'meta')

type _VerifyMlgFields = EnsureExactMlgKeys<IbmPage, typeof bmPageMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

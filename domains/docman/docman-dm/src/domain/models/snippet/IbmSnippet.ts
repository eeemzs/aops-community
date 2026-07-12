import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { snippetZodSchema, snippetZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSnippet = z.infer<typeof snippetZodSchema>
export type IbmSnippetInsert = z.infer<typeof snippetZodSchemaInsert>

export const ibmSnippetKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'snippetUid',
  'title',
  'language',
  'code',
  'description',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmSnippet)[]

type _VerifyKeys = EnsureAllKeys<IbmSnippet, typeof ibmSnippetKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

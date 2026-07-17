import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { pageSnippetLinkZodSchema, pageSnippetLinkZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmPageSnippetLink = z.infer<typeof pageSnippetLinkZodSchema>
export type IbmPageSnippetLinkInsert = z.infer<typeof pageSnippetLinkZodSchemaInsert>

export const ibmPageSnippetLinkKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'pageVersionId',
  'snippetId',
  'position',
  'caption',
  'showLineNumbers',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmPageSnippetLink)[]

type _VerifyKeys = EnsureAllKeys<IbmPageSnippetLink, typeof ibmPageSnippetLinkKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

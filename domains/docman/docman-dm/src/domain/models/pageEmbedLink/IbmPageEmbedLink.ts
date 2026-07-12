import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { pageEmbedLinkZodSchema, pageEmbedLinkZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmPageEmbedLink = z.infer<typeof pageEmbedLinkZodSchema>
export type IbmPageEmbedLinkInsert = z.infer<typeof pageEmbedLinkZodSchemaInsert>

export const ibmPageEmbedLinkKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'pageVersionId',
  'embedId',
  'position',
  'caption',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmPageEmbedLink)[]

type _VerifyKeys = EnsureAllKeys<IbmPageEmbedLink, typeof ibmPageEmbedLinkKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

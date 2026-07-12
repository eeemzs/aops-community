import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { embedZodSchema, embedZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmEmbed = z.infer<typeof embedZodSchema>
export type IbmEmbedInsert = z.infer<typeof embedZodSchemaInsert>

export const ibmEmbedKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'embedUid',
  'type',
  'title',
  'content',
  'url',
  'path',
  'mime',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmEmbed)[]

type _VerifyKeys = EnsureAllKeys<IbmEmbed, typeof ibmEmbedKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

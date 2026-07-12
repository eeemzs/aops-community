import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { memoryItemZodSchema, memoryItemZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmMemoryItem = z.infer<typeof memoryItemZodSchema>
export type IbmMemoryItemInsert = z.infer<typeof memoryItemZodSchemaInsert>

export const ibmMemoryItemKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'kind',
  'durability',
  'content',
  'tags',
  'importance',
  'sourceType',
  'sourceId',
  'meta',
] as const satisfies readonly (keyof IbmMemoryItem)[]

type _VerifyKeys = EnsureAllKeys<IbmMemoryItem, typeof ibmMemoryItemKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmMemoryItemMlgKeys = DotNestedMlgKeys<IbmMemoryItem>

export const bmMemoryItemMlgFields = mlgFieldsOf<IbmMemoryItem>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmMemoryItem, typeof bmMemoryItemMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

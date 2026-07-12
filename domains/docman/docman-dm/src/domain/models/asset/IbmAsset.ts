import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { assetZodSchema, assetZodSchemaInsert } from './zod.schema.js'

export type IbmAsset = z.infer<typeof assetZodSchema>
export type IbmAssetInsert = z.infer<typeof assetZodSchemaInsert>

export const ibmAssetKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'assetUid',
  'kind',
  'title',
  'slug',
  'altText',
  'currentVersionId',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmAsset)[]

type _VerifyKeys = EnsureAllKeys<IbmAsset, typeof ibmAssetKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

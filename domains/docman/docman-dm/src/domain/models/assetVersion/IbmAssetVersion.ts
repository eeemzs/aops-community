import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import {
  assetVersionMutablePatchZodSchema,
  assetVersionZodSchema,
  assetVersionZodSchemaInsert,
} from './zod.schema.js'

export type IbmAssetVersion = z.infer<typeof assetVersionZodSchema>
export type IbmAssetVersionInsert = z.infer<typeof assetVersionZodSchemaInsert>
export type IbmAssetVersionPatch = z.infer<typeof assetVersionMutablePatchZodSchema>

export const ibmAssetVersionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'assetId',
  'version',
  'label',
  'status',
  'storageKey',
  'sourcePath',
  'sourceUrl',
  'filename',
  'mime',
  'contentHash',
  'byteSize',
  'width',
  'height',
  'variants',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmAssetVersion)[]

type _VerifyKeys = EnsureAllKeys<IbmAssetVersion, typeof ibmAssetVersionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

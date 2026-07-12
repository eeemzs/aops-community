import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const assetVersionStatusZodSchema = z.enum(['draft', 'ready', 'archived', 'failed'])

export const assetVersionZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    assetId: z.string().uuid(),
    version: z.number().int(),
    label: z.string().optional(),
    status: assetVersionStatusZodSchema,
    storageKey: z.string().optional(),
    sourcePath: z.string().optional(),
    sourceUrl: z.string().optional(),
    filename: z.string().optional(),
    mime: z.string(),
    contentHash: z.string(),
    byteSize: z.number().int().nonnegative().optional(),
    width: z.number().int().nonnegative().optional(),
    height: z.number().int().nonnegative().optional(),
    variants: z.unknown().optional(),
    meta: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const assetVersionZodSchemaInsert = assetVersionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

export const assetVersionMutablePatchZodSchema = z.object({
  label: z.string().optional(),
  status: assetVersionStatusZodSchema.optional(),
  variants: z.unknown().optional(),
  meta: z.unknown().optional(),
  updatedBy: z.string().optional(),
}).strict()

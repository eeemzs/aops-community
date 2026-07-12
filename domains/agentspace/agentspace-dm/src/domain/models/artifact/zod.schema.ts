import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ARTIFACT_TYPES } from '../../types.js'
import { IArtifactZodCtx } from './resources.js'

export const artifactZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    artifactType: z.enum(ARTIFACT_TYPES),
    label: z.string().optional(),
    storagePath: z.string(),
    mimeType: z.string().optional(),
    sizeBytes: z.number().int().min(0).optional(),
    hash: z.string().optional(),
    meta: z.unknown().optional(),
  })

/* Insert schema */
export const artifactZodSchemaInsert = artifactZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createArtifactZodSchemaWithContext = (ctx?: IArtifactZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return artifactZodSchema.strict()
}

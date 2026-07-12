import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ARTIFACT_LINK_REF_TYPES } from '../../types.js'
import { IArtifactLinkZodCtx } from './resources.js'

export const artifactLinkZodSchema = z.object({
  ...IbmZodSchema.shape,
  projectId: z.string(),
  artifactId: z.string(),
  refType: z.enum(ARTIFACT_LINK_REF_TYPES),
  refId: z.string(),
  createdBy: z.string().optional(),
})

/* Insert schema */
export const artifactLinkZodSchemaInsert = artifactLinkZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createArtifactLinkZodSchemaWithContext = (_ctx?: IArtifactLinkZodCtx) => {
  return artifactLinkZodSchema.strict()
}

import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

const validateKindPayload = (
  value: { kind: 'section' | 'page'; sectionId?: string; pageVersionId?: string },
  ctx: z.RefinementCtx,
) => {
  if (value.kind === 'section') {
    if (!value.sectionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'sectionId is required when kind is section',
        path: ['sectionId'],
      })
    }
    if (value.pageVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pageVersionId must be empty when kind is section',
        path: ['pageVersionId'],
      })
    }
  }
  if (value.kind === 'page') {
    if (!value.pageVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pageVersionId is required when kind is page',
        path: ['pageVersionId'],
      })
    }
    if (value.sectionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'sectionId must be empty when kind is page',
        path: ['sectionId'],
      })
    }
  }
}

const documentSectionLinkZodSchemaBase = z
  .object({
    ...IbmZodSchema.shape,
    documentVersionId: z.string(),
    kind: z.enum(['section', 'page']),
    sectionId: z.string().optional(),
    pageVersionId: z.string().optional(),
    parentLinkId: z.string().nullable().optional(),
    position: z.number().int(),
    depth: z.number().int().optional(),
    titleOverride: z.string().optional(),
    titleVisible: z.boolean().optional(),
    numbering: z.string().optional(),
    pageBreakBefore: z.boolean().optional(),
    pageBreakAfter: z.boolean().optional(),
    directives: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const documentSectionLinkZodSchema = documentSectionLinkZodSchemaBase.superRefine((value, ctx) => {
  validateKindPayload(value, ctx)
})

/* Insert schema */
export const documentSectionLinkZodSchemaInsert = documentSectionLinkZodSchemaBase
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()
  .superRefine((value, ctx) => {
    validateKindPayload(value, ctx)
  })

/* Patch schema */
export const documentSectionLinkZodSchemaPatch = documentSectionLinkZodSchemaBase
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .partial()
  .strict()

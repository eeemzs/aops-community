import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { sectionPageLinkZodSchema, sectionPageLinkZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSectionPageLink = z.infer<typeof sectionPageLinkZodSchema>
export type IbmSectionPageLinkInsert = z.infer<typeof sectionPageLinkZodSchemaInsert>

export const ibmSectionPageLinkKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'sectionId',
  'pageVersionId',
  'position',
  'numbering',
  'titleOverride',
  'titleVisible',
  'pageBreakBefore',
  'pageBreakAfter',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmSectionPageLink)[]

type _VerifyKeys = EnsureAllKeys<IbmSectionPageLink, typeof ibmSectionPageLinkKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

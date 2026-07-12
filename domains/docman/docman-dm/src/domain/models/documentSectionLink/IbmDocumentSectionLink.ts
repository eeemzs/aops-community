import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { documentSectionLinkZodSchema, documentSectionLinkZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmDocumentSectionLink = z.infer<typeof documentSectionLinkZodSchema>
export type IbmDocumentSectionLinkInsert = z.infer<typeof documentSectionLinkZodSchemaInsert>

export const ibmDocumentSectionLinkKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'documentVersionId',
  'kind',
  'sectionId',
  'pageVersionId',
  'parentLinkId',
  'position',
  'depth',
  'titleOverride',
  'titleVisible',
  'numbering',
  'pageBreakBefore',
  'pageBreakAfter',
  'directives',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmDocumentSectionLink)[]

type _VerifyKeys = EnsureAllKeys<IbmDocumentSectionLink, typeof ibmDocumentSectionLinkKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { kanbanTemplateZodSchema, kanbanTemplateZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmKanbanTemplate = z.infer<typeof kanbanTemplateZodSchema>
export type IbmKanbanTemplateInsert = z.infer<typeof kanbanTemplateZodSchemaInsert>

export const ibmKanbanTemplateKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'name',
  'description',
  'definition',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmKanbanTemplate)[]

type _VerifyKeys = EnsureAllKeys<IbmKanbanTemplate, typeof ibmKanbanTemplateKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmKanbanTemplateMlgKeys = DotNestedMlgKeys<IbmKanbanTemplate>

export const bmKanbanTemplateMlgFields = mlgFieldsOf<IbmKanbanTemplate>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmKanbanTemplate, typeof bmKanbanTemplateMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields

import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmKanbanTemplate } from './IbmKanbanTemplate.js'
import type { ZodType } from 'zod'
import { IKanbanTemplateMlgTags, IKanbanTemplateZodCtx, kanbanTemplateResources } from './resources.js'
import { createKanbanTemplateZodSchemaWithContext } from './zod.schema.js'
import { bmKanbanTemplateMlgFields } from './IbmKanbanTemplate.js'

export class BmKanbanTemplate extends BmBase<IbmKanbanTemplate, IKanbanTemplateMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmKanbanTemplate> = bmKanbanTemplateMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmKanbanTemplate>) {
    super({ data, locale, fallbackLocale, logger }, kanbanTemplateResources)
  }

  public buildSchemas(zodCtx: IKanbanTemplateZodCtx): Record<string, ZodType> {
    return {
      default: createKanbanTemplateZodSchemaWithContext(zodCtx),
    }
  }
}

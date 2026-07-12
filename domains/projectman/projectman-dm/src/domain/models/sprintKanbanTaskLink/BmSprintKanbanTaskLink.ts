import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmSprintKanbanTaskLink } from './IbmSprintKanbanTaskLink.js'
import type { ZodType } from 'zod'
import { ISprintKanbanTaskLinkMlgTags, ISprintKanbanTaskLinkZodCtx, sprintKanbanTaskLinkResources } from './resources.js'
import { createSprintKanbanTaskLinkZodSchemaWithContext } from './zod.schema.js'
import { bmSprintKanbanTaskLinkMlgFields } from './IbmSprintKanbanTaskLink.js'

export class BmSprintKanbanTaskLink extends BmBase<IbmSprintKanbanTaskLink, ISprintKanbanTaskLinkMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmSprintKanbanTaskLink> = bmSprintKanbanTaskLinkMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmSprintKanbanTaskLink>) {
    super({ data, locale, fallbackLocale, logger }, sprintKanbanTaskLinkResources)
  }

  public buildSchemas(zodCtx: ISprintKanbanTaskLinkZodCtx): Record<string, ZodType> {
    return {
      default: createSprintKanbanTaskLinkZodSchemaWithContext(zodCtx),
    }
  }
}

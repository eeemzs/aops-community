import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmPlanningLineage } from './IbmPlanningLineage.js'

export interface IPlanningLineageMlgTags {}

export const planningLineageResources: BmResourceInline<IbmPlanningLineage, IPlanningLineageMlgTags> = {
  fields: {},
}

export type IPlanningLineageTranslationKeys = I18nBmValidKeys<
  IbmPlanningLineage,
  ValidationResourceType,
  IPlanningLineageMlgTags
>
export type IPlanningLineageZodCtx = I18nZodContextWithChain<IbmPlanningLineage, IPlanningLineageTranslationKeys>

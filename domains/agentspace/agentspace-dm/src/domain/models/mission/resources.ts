import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmMission } from './IbmMission.js'

export interface IMissionMlgTags {
  dummy?: string
}

export const missionResources: BmResourceInline<IbmMission, IMissionMlgTags> = {
  fields: {},
}

export type IMissionTranslationKeys = I18nBmValidKeys<IbmMission, ValidationResourceType, IMissionMlgTags>
export type IMissionZodCtx = I18nZodContextWithChain<IbmMission, IMissionTranslationKeys>

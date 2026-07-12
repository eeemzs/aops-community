import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmProjectMember } from './IbmProjectMember.js'

export interface IProjectMemberMlgTags {
  // add keys here if needed
}

export const projectMemberResources: BmResourceInline<IbmProjectMember, IProjectMemberMlgTags> = {
  fields: {}
}

export type IProjectMemberTranslationKeys = I18nBmValidKeys<IbmProjectMember, ValidationResourceType, IProjectMemberMlgTags>
export type IProjectMemberZodCtx = I18nZodContextWithChain<IbmProjectMember, IProjectMemberTranslationKeys>

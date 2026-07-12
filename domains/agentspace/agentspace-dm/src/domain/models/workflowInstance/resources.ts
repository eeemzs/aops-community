import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmWorkflowInstance } from './IbmWorkflowInstance.js'

export interface IWorkflowInstanceMlgTags {
  // add keys here if needed
}

export const workflowInstanceResources: BmResourceInline<IbmWorkflowInstance, IWorkflowInstanceMlgTags> = {
  fields: {}
}

export type IWorkflowInstanceTranslationKeys = I18nBmValidKeys<IbmWorkflowInstance, ValidationResourceType, IWorkflowInstanceMlgTags>
export type IWorkflowInstanceZodCtx = I18nZodContextWithChain<IbmWorkflowInstance, IWorkflowInstanceTranslationKeys>

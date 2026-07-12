import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmWorkflowStepRun } from './IbmWorkflowStepRun.js'

export interface IWorkflowStepRunMlgTags {
  // add keys here if needed
}

export const workflowStepRunResources: BmResourceInline<IbmWorkflowStepRun, IWorkflowStepRunMlgTags> = {
  fields: {}
}

export type IWorkflowStepRunTranslationKeys = I18nBmValidKeys<IbmWorkflowStepRun, ValidationResourceType, IWorkflowStepRunMlgTags>
export type IWorkflowStepRunZodCtx = I18nZodContextWithChain<IbmWorkflowStepRun, IWorkflowStepRunTranslationKeys>

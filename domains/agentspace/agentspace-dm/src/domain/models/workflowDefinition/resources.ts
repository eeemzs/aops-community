import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmWorkflowDefinition } from './IbmWorkflowDefinition.js'

export interface IWorkflowDefinitionMlgTags {
  // add keys here if needed
}

export const workflowDefinitionResources: BmResourceInline<IbmWorkflowDefinition, IWorkflowDefinitionMlgTags> = {
  fields: {},
}

export type IWorkflowDefinitionTranslationKeys = I18nBmValidKeys<
  IbmWorkflowDefinition,
  ValidationResourceType,
  IWorkflowDefinitionMlgTags
>
export type IWorkflowDefinitionZodCtx = I18nZodContextWithChain<
  IbmWorkflowDefinition,
  IWorkflowDefinitionTranslationKeys
>

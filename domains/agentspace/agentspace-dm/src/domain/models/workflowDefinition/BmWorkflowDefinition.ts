import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmWorkflowDefinition, bmWorkflowDefinitionMlgFields } from './IbmWorkflowDefinition.js'
import {
  IWorkflowDefinitionMlgTags,
  IWorkflowDefinitionZodCtx,
  workflowDefinitionResources,
} from './resources.js'
import { createWorkflowDefinitionZodSchemaWithContext } from './zod.schema.js'

export class BmWorkflowDefinition extends BmBase<IbmWorkflowDefinition, IWorkflowDefinitionMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmWorkflowDefinition> = bmWorkflowDefinitionMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmWorkflowDefinition>) {
    super({ data, locale, fallbackLocale, logger }, workflowDefinitionResources)
  }

  public buildSchemas(zodCtx: IWorkflowDefinitionZodCtx) {
    return {
      default: createWorkflowDefinitionZodSchemaWithContext(zodCtx),
    }
  }
}

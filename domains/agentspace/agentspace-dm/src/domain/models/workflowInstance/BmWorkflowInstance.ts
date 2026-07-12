import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmWorkflowInstance } from './IbmWorkflowInstance.js'
import { IWorkflowInstanceMlgTags, IWorkflowInstanceZodCtx, workflowInstanceResources } from './resources.js'
import { createWorkflowInstanceZodSchemaWithContext } from './zod.schema.js'
import { bmWorkflowInstanceMlgFields } from './IbmWorkflowInstance.js'

export class BmWorkflowInstance extends BmBase<IbmWorkflowInstance, IWorkflowInstanceMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmWorkflowInstance> = bmWorkflowInstanceMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmWorkflowInstance>) {
    super({ data, locale, fallbackLocale, logger }, workflowInstanceResources)
  }

  public buildSchemas(zodCtx: IWorkflowInstanceZodCtx) {
    return {
      default: createWorkflowInstanceZodSchemaWithContext(zodCtx),
    }
  }
}

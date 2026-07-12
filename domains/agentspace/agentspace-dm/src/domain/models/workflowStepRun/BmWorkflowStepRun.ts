import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmWorkflowStepRun } from './IbmWorkflowStepRun.js'
import { IWorkflowStepRunMlgTags, IWorkflowStepRunZodCtx, workflowStepRunResources } from './resources.js'
import { createWorkflowStepRunZodSchemaWithContext } from './zod.schema.js'
import { bmWorkflowStepRunMlgFields } from './IbmWorkflowStepRun.js'

export class BmWorkflowStepRun extends BmBase<IbmWorkflowStepRun, IWorkflowStepRunMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmWorkflowStepRun> = bmWorkflowStepRunMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmWorkflowStepRun>) {
    super({ data, locale, fallbackLocale, logger }, workflowStepRunResources)
  }

  public buildSchemas(zodCtx: IWorkflowStepRunZodCtx) {
    return {
      default: createWorkflowStepRunZodSchemaWithContext(zodCtx),
    }
  }
}

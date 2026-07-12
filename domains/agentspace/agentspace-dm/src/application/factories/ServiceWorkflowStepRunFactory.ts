import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IWorkflowStepRunServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderWorkflowStepRun, type WorkflowStepRunServiceFactoryConfig, type WorkflowStepRunServiceFactoryOverrides } from './ServiceWorkflowStepRunBuilder.js'
import { WorkflowStepRunServiceError } from '../errors/WorkflowStepRunServiceError.js'

export const ServiceFactoryWorkflowStepRun = {
  create({ config, overrides = {} }: { config: WorkflowStepRunServiceFactoryConfig; overrides?: WorkflowStepRunServiceFactoryOverrides }): Effect.Effect<IWorkflowStepRunServicePort, WorkflowStepRunServiceError> {
    config.logger?.child({ module: 'ServiceFactoryWorkflowStepRun', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderWorkflowStepRun.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderWorkflowStepRun.create()
  },
}

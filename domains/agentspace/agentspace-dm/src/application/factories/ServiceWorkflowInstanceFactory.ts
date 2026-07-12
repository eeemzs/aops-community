import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IWorkflowInstanceServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderWorkflowInstance, type WorkflowInstanceServiceFactoryConfig, type WorkflowInstanceServiceFactoryOverrides } from './ServiceWorkflowInstanceBuilder.js'
import { WorkflowInstanceServiceError } from '../errors/WorkflowInstanceServiceError.js'

export const ServiceFactoryWorkflowInstance = {
  create({ config, overrides = {} }: { config: WorkflowInstanceServiceFactoryConfig; overrides?: WorkflowInstanceServiceFactoryOverrides }): Effect.Effect<IWorkflowInstanceServicePort, WorkflowInstanceServiceError> {
    config.logger?.child({ module: 'ServiceFactoryWorkflowInstance', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderWorkflowInstance.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderWorkflowInstance.create()
  },
}

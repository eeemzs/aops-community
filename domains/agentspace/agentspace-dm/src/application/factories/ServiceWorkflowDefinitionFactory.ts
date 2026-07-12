import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IWorkflowDefinitionServicePort } from '../ports/inbound/index.js'
import {
  ServiceBuilderWorkflowDefinition,
  type WorkflowDefinitionServiceFactoryConfig,
  type WorkflowDefinitionServiceFactoryOverrides,
} from './ServiceWorkflowDefinitionBuilder.js'
import { WorkflowDefinitionServiceError } from '../errors/WorkflowDefinitionServiceError.js'

export const ServiceFactoryWorkflowDefinition = {
  create({
    config,
    overrides = {},
  }: {
    config: WorkflowDefinitionServiceFactoryConfig
    overrides?: WorkflowDefinitionServiceFactoryOverrides
  }): Effect.Effect<IWorkflowDefinitionServicePort, WorkflowDefinitionServiceError> {
    config.logger?.child(
      { module: 'ServiceFactoryWorkflowDefinition', parent: getParent(config.logger) },
      { level: config.logLevel ?? 'info' }
    )
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderWorkflowDefinition.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderWorkflowDefinition.create()
  },
}

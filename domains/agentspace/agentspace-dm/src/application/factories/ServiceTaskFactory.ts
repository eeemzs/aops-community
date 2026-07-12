import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ITaskServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderTask, type TaskServiceFactoryConfig, type TaskServiceFactoryOverrides, type TaskServiceFactoryDependencies } from './ServiceTaskBuilder.js'
import { TaskServiceError } from '../errors/TaskServiceError.js'

export const ServiceFactoryTask = {
  create({
    config,
    overrides = {},
    dependencies = {},
  }: {
    config: TaskServiceFactoryConfig;
    overrides?: TaskServiceFactoryOverrides;
    dependencies?: Partial<TaskServiceFactoryDependencies>;
  }): Effect.Effect<ITaskServicePort, TaskServiceError> {
    config.logger?.child({ module: 'ServiceFactoryTask', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderTask.create()
        .withConfig(config)
        .withOverrides(overrides)
        .withServiceDependencies(dependencies)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderTask.create()
  },
}

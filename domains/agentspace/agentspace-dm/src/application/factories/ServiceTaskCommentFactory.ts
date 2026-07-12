import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ITaskCommentServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderTaskComment, type TaskCommentServiceFactoryConfig, type TaskCommentServiceFactoryOverrides } from './ServiceTaskCommentBuilder.js'
import { TaskCommentServiceError } from '../errors/TaskCommentServiceError.js'

export const ServiceFactoryTaskComment = {
  create({ config, overrides = {} }: { config: TaskCommentServiceFactoryConfig; overrides?: TaskCommentServiceFactoryOverrides }): Effect.Effect<ITaskCommentServicePort, TaskCommentServiceError> {
    config.logger?.child({ module: 'ServiceFactoryTaskComment', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderTaskComment.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderTaskComment.create()
  },
}

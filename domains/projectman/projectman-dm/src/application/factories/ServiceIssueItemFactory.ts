import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IIssueItemServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderIssueItem, type IssueItemServiceFactoryConfig, type IssueItemServiceFactoryOverrides } from './ServiceIssueItemBuilder.js'
import { IssueItemServiceError } from '../errors/IssueItemServiceError.js'

export const ServiceFactoryIssueItem = {
  create({ config, overrides = {} }: { config: IssueItemServiceFactoryConfig; overrides?: IssueItemServiceFactoryOverrides }): Effect.Effect<IIssueItemServicePort, IssueItemServiceError> {
    config.logger?.child({ module: 'ServiceFactoryIssueItem', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderIssueItem.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderIssueItem.create()
  },
}

import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ICodexChatThreadServicePort } from '../ports/inbound/index.js'
import {
  ServiceBuilderCodexChatThread,
  type CodexChatThreadServiceFactoryConfig,
  type CodexChatThreadServiceFactoryOverrides,
} from './ServiceCodexChatThreadBuilder.js'
import { CodexChatThreadServiceError } from '../errors/CodexChatThreadServiceError.js'

export const ServiceFactoryCodexChatThread = {
  create({ config, overrides = {} }: { config: CodexChatThreadServiceFactoryConfig; overrides?: CodexChatThreadServiceFactoryOverrides }): Effect.Effect<ICodexChatThreadServicePort, CodexChatThreadServiceError> {
    config.logger?.child({ module: 'ServiceFactoryCodexChatThread', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderCodexChatThread.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderCodexChatThread.create()
  },
}

import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ICodexChatMessageServicePort } from '../ports/inbound/index.js'
import {
  ServiceBuilderCodexChatMessage,
  type CodexChatMessageServiceFactoryConfig,
  type CodexChatMessageServiceFactoryOverrides,
} from './ServiceCodexChatMessageBuilder.js'
import { CodexChatMessageServiceError } from '../errors/CodexChatMessageServiceError.js'

export const ServiceFactoryCodexChatMessage = {
  create({ config, overrides = {} }: { config: CodexChatMessageServiceFactoryConfig; overrides?: CodexChatMessageServiceFactoryOverrides }): Effect.Effect<ICodexChatMessageServicePort, CodexChatMessageServiceError> {
    config.logger?.child({ module: 'ServiceFactoryCodexChatMessage', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderCodexChatMessage.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderCodexChatMessage.create()
  },
}

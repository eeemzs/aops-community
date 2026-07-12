import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IChatServicePort } from '../ports/inbound/index.js'
import {
  ServiceBuilderChat,
  type ChatServiceFactoryConfig,
  type ChatServiceFactoryOverrides,
} from './ServiceChatBuilder.js'
import { ChatServiceError } from '../errors/ChatServiceError.js'

export const ServiceFactoryChat = {
  create({ config, overrides = {} }: { config: ChatServiceFactoryConfig; overrides?: ChatServiceFactoryOverrides }): Effect.Effect<IChatServicePort, ChatServiceError> {
    config.logger?.child({ module: 'ServiceFactoryChat', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderChat.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderChat.create()
  },
}

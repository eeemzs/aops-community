import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ICodexChatSettingServicePort } from '../ports/inbound/index.js'
import {
  ServiceBuilderCodexChatSetting,
  type CodexChatSettingServiceFactoryConfig,
  type CodexChatSettingServiceFactoryOverrides,
} from './ServiceCodexChatSettingBuilder.js'
import { CodexChatSettingServiceError } from '../errors/CodexChatSettingServiceError.js'

export const ServiceFactoryCodexChatSetting = {
  create({ config, overrides = {} }: { config: CodexChatSettingServiceFactoryConfig; overrides?: CodexChatSettingServiceFactoryOverrides }): Effect.Effect<ICodexChatSettingServicePort, CodexChatSettingServiceError> {
    config.logger?.child({ module: 'ServiceFactoryCodexChatSetting', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderCodexChatSetting.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderCodexChatSetting.create()
  },
}

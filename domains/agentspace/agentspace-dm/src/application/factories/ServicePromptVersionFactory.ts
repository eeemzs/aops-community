import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IPromptVersionServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderPromptVersion, type PromptVersionServiceFactoryConfig, type PromptVersionServiceFactoryOverrides, type PromptVersionServiceFactoryDependencies } from './ServicePromptVersionBuilder.js'
import { PromptVersionServiceError } from '../errors/PromptVersionServiceError.js'

export const ServiceFactoryPromptVersion = {
  create({
    config,
    overrides = {},
    dependencies = {},
  }: {
    config: PromptVersionServiceFactoryConfig;
    overrides?: PromptVersionServiceFactoryOverrides;
    dependencies?: Partial<PromptVersionServiceFactoryDependencies>;
  }): Effect.Effect<IPromptVersionServicePort, PromptVersionServiceError> {
    config.logger?.child({ module: 'ServiceFactoryPromptVersion', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderPromptVersion.create()
        .withConfig(config)
        .withOverrides(overrides)
        .withServiceDependencies(dependencies)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderPromptVersion.create()
  },
}

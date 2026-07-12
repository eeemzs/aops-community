import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISkillVersionServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSkillVersion, type SkillVersionServiceFactoryConfig, type SkillVersionServiceFactoryOverrides, type SkillVersionServiceFactoryDependencies } from './ServiceSkillVersionBuilder.js'
import { SkillVersionServiceError } from '../errors/SkillVersionServiceError.js'

export const ServiceFactorySkillVersion = {
  create({
    config,
    overrides = {},
    dependencies = {},
  }: {
    config: SkillVersionServiceFactoryConfig;
    overrides?: SkillVersionServiceFactoryOverrides;
    dependencies?: Partial<SkillVersionServiceFactoryDependencies>;
  }): Effect.Effect<ISkillVersionServicePort, SkillVersionServiceError> {
    config.logger?.child({ module: 'ServiceFactorySkillVersion', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSkillVersion.create()
        .withConfig(config)
        .withOverrides(overrides)
        .withServiceDependencies(dependencies)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSkillVersion.create()
  },
}

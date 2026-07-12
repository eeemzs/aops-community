import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'

import type { IExperienceItemServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderExperienceItem, type ExperienceItemServiceFactoryConfig, type ExperienceItemServiceFactoryOverrides } from './ServiceExperienceItemBuilder.js'
import { ExperienceItemServiceError } from '../errors/ExperienceItemServiceError.js'

export const ServiceFactoryExperienceItem = {
  create({ config, overrides = {} }: { config: ExperienceItemServiceFactoryConfig; overrides?: ExperienceItemServiceFactoryOverrides }): Effect.Effect<IExperienceItemServicePort, ExperienceItemServiceError> {
    config.logger?.child({ module: 'ServiceFactoryExperienceItem', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderExperienceItem.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderExperienceItem.create()
  },
}

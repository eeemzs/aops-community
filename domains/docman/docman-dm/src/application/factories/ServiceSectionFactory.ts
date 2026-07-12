import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISectionServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSection, type SectionServiceFactoryConfig, type SectionServiceFactoryOverrides } from './ServiceSectionBuilder.js'
import { SectionServiceError } from '../errors/SectionServiceError.js'

export const ServiceFactorySection = {
  create({ config, overrides = {} }: { config: SectionServiceFactoryConfig; overrides?: SectionServiceFactoryOverrides }): Effect.Effect<ISectionServicePort, SectionServiceError> {
    config.logger?.child({ module: 'ServiceFactorySection', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSection.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSection.create()
  },
}


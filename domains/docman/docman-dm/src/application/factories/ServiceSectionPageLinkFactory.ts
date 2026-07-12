import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISectionPageLinkServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSectionPageLink, type SectionPageLinkServiceFactoryConfig, type SectionPageLinkServiceFactoryOverrides } from './ServiceSectionPageLinkBuilder.js'
import { SectionPageLinkServiceError } from '../errors/SectionPageLinkServiceError.js'

export const ServiceFactorySectionPageLink = {
  create({ config, overrides = {} }: { config: SectionPageLinkServiceFactoryConfig; overrides?: SectionPageLinkServiceFactoryOverrides }): Effect.Effect<ISectionPageLinkServicePort, SectionPageLinkServiceError> {
    config.logger?.child({ module: 'ServiceFactorySectionPageLink', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSectionPageLink.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSectionPageLink.create()
  },
}


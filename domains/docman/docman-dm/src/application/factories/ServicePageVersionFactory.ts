import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IPageVersionServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderPageVersion, type PageVersionServiceFactoryConfig, type PageVersionServiceFactoryOverrides } from './ServicePageVersionBuilder.js'
import { PageVersionServiceError } from '../errors/PageVersionServiceError.js'

export const ServiceFactoryPageVersion = {
  create({ config, overrides = {} }: { config: PageVersionServiceFactoryConfig; overrides?: PageVersionServiceFactoryOverrides }): Effect.Effect<IPageVersionServicePort, PageVersionServiceError> {
    config.logger?.child({ module: 'ServiceFactoryPageVersion', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderPageVersion.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderPageVersion.create()
  },
}


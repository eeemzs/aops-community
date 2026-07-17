import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IPageServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderPage, type PageServiceFactoryConfig, type PageServiceFactoryOverrides } from './ServicePageBuilder.js'
import { PageServiceError } from '../errors/PageServiceError.js'

export const ServiceFactoryPage = {
  create({ config, overrides = {} }: { config: PageServiceFactoryConfig; overrides?: PageServiceFactoryOverrides }): Effect.Effect<IPageServicePort, PageServiceError> {
    config.logger?.child({ module: 'ServiceFactoryPage', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderPage.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderPage.create()
  },
}

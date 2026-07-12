import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IAssetVersionServicePort } from '../ports/inbound/index.js'
import {
  ServiceBuilderAssetVersion,
  type AssetVersionServiceFactoryConfig,
  type AssetVersionServiceFactoryOverrides,
} from './ServiceAssetVersionBuilder.js'
import { AssetVersionServiceError } from '../errors/AssetVersionServiceError.js'

export const ServiceFactoryAssetVersion = {
  create({ config, overrides = {} }: { config: AssetVersionServiceFactoryConfig; overrides?: AssetVersionServiceFactoryOverrides }): Effect.Effect<IAssetVersionServicePort, AssetVersionServiceError> {
    config.logger?.child({ module: 'ServiceFactoryAssetVersion', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderAssetVersion.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderAssetVersion.create()
  },
}

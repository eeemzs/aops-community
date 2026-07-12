import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IAssetServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderAsset, type AssetServiceFactoryConfig, type AssetServiceFactoryOverrides } from './ServiceAssetBuilder.js'
import { AssetServiceError } from '../errors/AssetServiceError.js'

export const ServiceFactoryAsset = {
  create({ config, overrides = {} }: { config: AssetServiceFactoryConfig; overrides?: AssetServiceFactoryOverrides }): Effect.Effect<IAssetServicePort, AssetServiceError> {
    config.logger?.child({ module: 'ServiceFactoryAsset', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderAsset.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderAsset.create()
  },
}

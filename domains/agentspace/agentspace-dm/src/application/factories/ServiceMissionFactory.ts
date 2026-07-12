import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IMissionServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderMission, type MissionServiceFactoryConfig, type MissionServiceFactoryOverrides } from './ServiceMissionBuilder.js'
import { MissionServiceError } from '../errors/MissionServiceError.js'

export const ServiceFactoryMission = {
  create({ config, overrides = {} }: { config: MissionServiceFactoryConfig; overrides?: MissionServiceFactoryOverrides }): Effect.Effect<IMissionServicePort, MissionServiceError> {
    config.logger?.child({ module: 'ServiceFactoryMission', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderMission.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderMission.create()
  },
}

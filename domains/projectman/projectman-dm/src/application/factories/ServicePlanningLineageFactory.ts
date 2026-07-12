import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IPlanningLineageServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderPlanningLineage, type PlanningLineageServiceFactoryConfig, type PlanningLineageServiceFactoryOverrides } from './ServicePlanningLineageBuilder.js'
import { PlanningLineageServiceError } from '../errors/PlanningLineageServiceError.js'

export const ServiceFactoryPlanningLineage = {
  create({ config, overrides = {} }: { config: PlanningLineageServiceFactoryConfig; overrides?: PlanningLineageServiceFactoryOverrides }): Effect.Effect<IPlanningLineageServicePort, PlanningLineageServiceError> {
    config.logger?.child({ module: 'ServiceFactoryPlanningLineage', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderPlanningLineage.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderPlanningLineage.create()
  },
}

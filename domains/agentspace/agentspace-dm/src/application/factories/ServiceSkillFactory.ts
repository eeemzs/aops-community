import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISkillServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSkill, type SkillServiceFactoryConfig, type SkillServiceFactoryOverrides } from './ServiceSkillBuilder.js'
import { SkillServiceError } from '../errors/SkillServiceError.js'

export const ServiceFactorySkill = {
  create({ config, overrides = {} }: { config: SkillServiceFactoryConfig; overrides?: SkillServiceFactoryOverrides }): Effect.Effect<ISkillServicePort, SkillServiceError> {
    config.logger?.child({ module: 'ServiceFactorySkill', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSkill.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSkill.create()
  },
}

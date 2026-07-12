import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSkill } from '../../../../domain/models/index.js'
import { IRepositoryPortSkill } from '../../../../application/ports/repository-ports/index.js'
import { IdbSkillDrizzle, skillTable } from '../../../db/skill/drizzle/drizzle.schema.skill.js'
import { mapperSkillDrizzle } from '../../../db/skill/drizzle/drizzle.mapper.skill.js'

export class SkillDrizzleRepo extends DraBase<IbmSkill, IdbSkillDrizzle, typeof skillTable> implements IRepositoryPortSkill {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(skillTable, { mapper: mapperSkillDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSkill>): Effect.Effect<IbmSkill | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSkillDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}


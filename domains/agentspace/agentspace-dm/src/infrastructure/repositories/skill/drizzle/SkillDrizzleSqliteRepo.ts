import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSkill } from '../../../../domain/models/index.js'
import { IRepositoryPortSkill } from '../../../../application/ports/repository-ports/index.js'
import { IdbSkillDrizzleSqlite, skillTableSqlite } from '../../../db/skill/drizzle/drizzle.schema.skill.sqlite.js'
import { mapperSkillDrizzle } from '../../../db/skill/drizzle/drizzle.mapper.skill.js'

export class SkillDrizzleSqliteRepo extends DraBaseSqlite<IbmSkill, IdbSkillDrizzleSqlite, typeof skillTableSqlite> implements IRepositoryPortSkill {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(skillTableSqlite, { mapper: mapperSkillDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSkill>): Effect.Effect<IbmSkill | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSkillDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSkillVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortSkillVersion } from '../../../../application/ports/repository-ports/index.js'
import { IdbSkillVersionDrizzleSqlite, skillVersionTableSqlite } from '../../../db/skillVersion/drizzle/drizzle.schema.skillVersion.sqlite.js'
import { mapperSkillVersionDrizzle } from '../../../db/skillVersion/drizzle/drizzle.mapper.skillVersion.js'

export class SkillVersionDrizzleSqliteRepo extends DraBaseSqlite<IbmSkillVersion, IdbSkillVersionDrizzleSqlite, typeof skillVersionTableSqlite> implements IRepositoryPortSkillVersion {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(skillVersionTableSqlite, { mapper: mapperSkillVersionDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSkillVersion>): Effect.Effect<IbmSkillVersion | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSkillVersionDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

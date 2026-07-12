import { XfLogger } from '@aopslab/xf-logger'
import { RepositoryConfig } from '@aopslab/xf-db'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'

import { IbmProjectPath } from '../../../../domain/models/index.js'
import { IRepositoryPortProjectPath } from '../../../../application/ports/repository-ports/index.js'
import { IdbProjectPathDrizzleSqlite, projectPathTableSqlite } from '../../../db/projectPath/drizzle/drizzle.schema.projectPath.sqlite.js'
import { mapperProjectPathDrizzle } from '../../../db/projectPath/drizzle/drizzle.mapper.projectPath.js'

export class ProjectPathDrizzleSqliteRepo extends DraBaseSqlite<IbmProjectPath, IdbProjectPathDrizzleSqlite, typeof projectPathTableSqlite> implements IRepositoryPortProjectPath {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(projectPathTableSqlite, { mapper: mapperProjectPathDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmProjectPath>): Effect.Effect<IbmProjectPath | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbProjectPathDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

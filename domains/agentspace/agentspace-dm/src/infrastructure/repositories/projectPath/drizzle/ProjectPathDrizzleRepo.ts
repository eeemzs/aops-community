import { XfLogger } from '@aopslab/xf-logger'
import { RepositoryConfig } from '@aopslab/xf-db'
import { DraBase } from '@aopslab/xf-db-drizzle'

import { IbmProjectPath } from '../../../../domain/models/index.js'
import { IRepositoryPortProjectPath } from '../../../../application/ports/repository-ports/index.js'
import { IdbProjectPathDrizzle, projectPathTable } from '../../../db/projectPath/drizzle/drizzle.schema.projectPath.js'
import { mapperProjectPathDrizzle } from '../../../db/projectPath/drizzle/drizzle.mapper.projectPath.js'

export class ProjectPathDrizzleRepo extends DraBase<IbmProjectPath, IdbProjectPathDrizzle, typeof projectPathTable> implements IRepositoryPortProjectPath {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(projectPathTable, { mapper: mapperProjectPathDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmProjectPath>): Effect.Effect<IbmProjectPath | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbProjectPathDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmProjectMember } from '../../../../domain/models/index.js'
import { IRepositoryPortProjectMember } from '../../../../application/ports/repository-ports/index.js'
import { IdbProjectMemberDrizzleSqlite, projectMemberTableSqlite } from '../../../db/projectMember/drizzle/drizzle.schema.projectMember.sqlite.js'
import { mapperProjectMemberDrizzle } from '../../../db/projectMember/drizzle/drizzle.mapper.projectMember.js'

export class ProjectMemberDrizzleSqliteRepo extends DraBaseSqlite<IbmProjectMember, IdbProjectMemberDrizzleSqlite, typeof projectMemberTableSqlite> implements IRepositoryPortProjectMember {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(projectMemberTableSqlite, { mapper: mapperProjectMemberDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmProjectMember>): Effect.Effect<IbmProjectMember | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbProjectMemberDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

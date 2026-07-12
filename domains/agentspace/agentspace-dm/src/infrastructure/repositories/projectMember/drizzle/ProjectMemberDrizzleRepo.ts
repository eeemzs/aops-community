import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmProjectMember } from '../../../../domain/models/index.js'
import { IRepositoryPortProjectMember } from '../../../../application/ports/repository-ports/index.js'
import { IdbProjectMemberDrizzle, projectMemberTable } from '../../../db/projectMember/drizzle/drizzle.schema.projectMember.js'
import { mapperProjectMemberDrizzle } from '../../../db/projectMember/drizzle/drizzle.mapper.projectMember.js'

export class ProjectMemberDrizzleRepo extends DraBase<IbmProjectMember, IdbProjectMemberDrizzle, typeof projectMemberTable> implements IRepositoryPortProjectMember {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(projectMemberTable, { mapper: mapperProjectMemberDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmProjectMember>): Effect.Effect<IbmProjectMember | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbProjectMemberDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

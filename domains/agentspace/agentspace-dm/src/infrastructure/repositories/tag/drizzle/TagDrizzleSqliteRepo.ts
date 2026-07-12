import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmTag } from '../../../../domain/models/index.js'
import { IRepositoryPortTag } from '../../../../application/ports/repository-ports/index.js'
import { IdbTagDrizzleSqlite, tagTableSqlite } from '../../../db/tag/drizzle/drizzle.schema.tag.sqlite.js'
import { mapperTagDrizzle } from '../../../db/tag/drizzle/drizzle.mapper.tag.js'

export class TagDrizzleSqliteRepo extends DraBaseSqlite<IbmTag, IdbTagDrizzleSqlite, typeof tagTableSqlite> implements IRepositoryPortTag {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(tagTableSqlite, { mapper: mapperTagDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmTag>): Effect.Effect<IbmTag | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbTagDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

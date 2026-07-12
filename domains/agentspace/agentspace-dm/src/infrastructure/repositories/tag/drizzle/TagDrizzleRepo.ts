import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmTag } from '../../../../domain/models/index.js'
import { IRepositoryPortTag } from '../../../../application/ports/repository-ports/index.js'
import { IdbTagDrizzle, tagTable } from '../../../db/tag/drizzle/drizzle.schema.tag.js'
import { mapperTagDrizzle } from '../../../db/tag/drizzle/drizzle.mapper.tag.js'

export class TagDrizzleRepo extends DraBase<IbmTag, IdbTagDrizzle, typeof tagTable> implements IRepositoryPortTag {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(tagTable, { mapper: mapperTagDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmTag>): Effect.Effect<IbmTag | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbTagDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

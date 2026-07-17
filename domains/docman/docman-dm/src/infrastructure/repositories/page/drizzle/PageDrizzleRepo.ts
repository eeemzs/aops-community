import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPage } from '../../../../domain/models/index.js'
import { IRepositoryPortPage } from '../../../../application/ports/repository-ports/index.js'
import { IdbPageDrizzle, pageTable } from '../../../db/page/drizzle/drizzle.schema.page.js'
import { mapperPageDrizzle } from '../../../db/page/drizzle/drizzle.mapper.page.js'

export class PageDrizzleRepo extends DraBase<IbmPage, IdbPageDrizzle, typeof pageTable> implements IRepositoryPortPage {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pageTable, { mapper: mapperPageDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmPage>): Effect.Effect<IbmPage | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbPageDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

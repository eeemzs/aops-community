import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSectionPageLink } from '../../../../domain/models/index.js'
import { IRepositoryPortSectionPageLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbSectionPageLinkDrizzle, sectionPageLinkTable } from '../../../db/sectionPageLink/drizzle/drizzle.schema.sectionPageLink.js'
import { mapperSectionPageLinkDrizzle } from '../../../db/sectionPageLink/drizzle/drizzle.mapper.sectionPageLink.js'

export class SectionPageLinkDrizzleRepo extends DraBase<IbmSectionPageLink, IdbSectionPageLinkDrizzle, typeof sectionPageLinkTable> implements IRepositoryPortSectionPageLink {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sectionPageLinkTable, { mapper: mapperSectionPageLinkDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSectionPageLink>): Effect.Effect<IbmSectionPageLink | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSectionPageLinkDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}


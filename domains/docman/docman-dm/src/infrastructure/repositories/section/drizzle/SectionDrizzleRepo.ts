import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSection } from '../../../../domain/models/index.js'
import { IRepositoryPortSection } from '../../../../application/ports/repository-ports/index.js'
import { IdbSectionDrizzle, sectionTable } from '../../../db/section/drizzle/drizzle.schema.section.js'
import { mapperSectionDrizzle } from '../../../db/section/drizzle/drizzle.mapper.section.js'

export class SectionDrizzleRepo extends DraBase<IbmSection, IdbSectionDrizzle, typeof sectionTable> implements IRepositoryPortSection {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sectionTable, { mapper: mapperSectionDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSection>): Effect.Effect<IbmSection | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSectionDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

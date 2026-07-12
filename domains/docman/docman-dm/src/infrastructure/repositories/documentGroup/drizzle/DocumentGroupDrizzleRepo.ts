import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmDocumentGroup } from '../../../../domain/models/index.js'
import { IRepositoryPortDocumentGroup } from '../../../../application/ports/repository-ports/index.js'
import { IdbDocumentGroupDrizzle, documentGroupTable } from '../../../db/documentGroup/drizzle/drizzle.schema.documentGroup.js'
import { mapperDocumentGroupDrizzle } from '../../../db/documentGroup/drizzle/drizzle.mapper.documentGroup.js'

export class DocumentGroupDrizzleRepo extends DraBase<IbmDocumentGroup, IdbDocumentGroupDrizzle, typeof documentGroupTable> implements IRepositoryPortDocumentGroup {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentGroupTable, { mapper: mapperDocumentGroupDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmDocumentGroup>): Effect.Effect<IbmDocumentGroup | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbDocumentGroupDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

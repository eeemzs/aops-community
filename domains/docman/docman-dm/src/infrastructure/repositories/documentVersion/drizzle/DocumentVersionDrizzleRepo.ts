import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmDocumentVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortDocumentVersion } from '../../../../application/ports/repository-ports/index.js'
import { IdbDocumentVersionDrizzle, documentVersionTable } from '../../../db/documentVersion/drizzle/drizzle.schema.documentVersion.js'
import { mapperDocumentVersionDrizzle } from '../../../db/documentVersion/drizzle/drizzle.mapper.documentVersion.js'

export class DocumentVersionDrizzleRepo extends DraBase<IbmDocumentVersion, IdbDocumentVersionDrizzle, typeof documentVersionTable> implements IRepositoryPortDocumentVersion {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentVersionTable, { mapper: mapperDocumentVersionDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmDocumentVersion>): Effect.Effect<IbmDocumentVersion | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbDocumentVersionDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

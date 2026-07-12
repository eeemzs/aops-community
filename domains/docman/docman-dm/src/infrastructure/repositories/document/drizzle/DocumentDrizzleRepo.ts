import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmDocument } from '../../../../domain/models/index.js'
import { IRepositoryPortDocument } from '../../../../application/ports/repository-ports/index.js'
import { IdbDocumentDrizzle, documentTable } from '../../../db/document/drizzle/drizzle.schema.document.js'
import { mapperDocumentDrizzle } from '../../../db/document/drizzle/drizzle.mapper.document.js'

export class DocumentDrizzleRepo extends DraBase<IbmDocument, IdbDocumentDrizzle, typeof documentTable> implements IRepositoryPortDocument {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentTable, { mapper: mapperDocumentDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmDocument>): Effect.Effect<IbmDocument | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbDocumentDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}


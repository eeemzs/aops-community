import { Effect } from 'effect'
import { and, eq } from 'drizzle-orm'
import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig, RepositoryError } from '@aopslab/xf-db'

import { type DocumentSectionLinkUsageItem } from '../../../../application/ports/repository-ports/IRepositoryPortDocumentSectionLink.js'
import { IbmDocumentSectionLink } from '../../../../domain/models/index.js'
import { IRepositoryPortDocumentSectionLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbDocumentSectionLinkDrizzle, documentSectionLinkTable } from '../../../db/documentSectionLink/drizzle/drizzle.schema.documentSectionLink.js'
import { mapperDocumentSectionLinkDrizzle } from '../../../db/documentSectionLink/drizzle/drizzle.mapper.documentSectionLink.js'
import { documentTable } from '../../../db/document/drizzle/drizzle.schema.document.js'
import { documentVersionTable } from '../../../db/documentVersion/drizzle/drizzle.schema.documentVersion.js'

export class DocumentSectionLinkDrizzleRepo extends DraBase<IbmDocumentSectionLink, IdbDocumentSectionLinkDrizzle, typeof documentSectionLinkTable> implements IRepositoryPortDocumentSectionLink {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentSectionLinkTable, { mapper: mapperDocumentSectionLinkDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  listDocumentSectionLinkUsageBySectionId(sectionId: string): Effect.Effect<DocumentSectionLinkUsageItem[], RepositoryError> {
    const stage = 'DocumentSectionLinkDrizzleRepo::listDocumentSectionLinkUsageBySectionId'
    return Effect.gen(this, function* () {
      const db = yield* this.getDb()
      const rows = yield* Effect.tryPromise({
        try: async () =>
          db
            .select({
              id: documentSectionLinkTable.id,
              documentId: documentVersionTable.documentId,
              documentVersionId: documentSectionLinkTable.documentVersionId,
              documentVersion: documentVersionTable.version,
              documentTitle: documentTable.title,
              sectionId: documentSectionLinkTable.sectionId,
              position: documentSectionLinkTable.position,
            })
            .from(documentSectionLinkTable)
            .innerJoin(
              documentVersionTable,
              eq(documentSectionLinkTable.documentVersionId, documentVersionTable.id),
            )
            .innerJoin(documentTable, eq(documentVersionTable.documentId, documentTable.id))
            .where(
              and(
                eq(documentSectionLinkTable.sectionId, sectionId),
                eq(documentSectionLinkTable.tenantId, this.tenantId),
                eq(documentVersionTable.tenantId, this.tenantId),
                eq(documentTable.tenantId, this.tenantId),
              ),
            )
            .orderBy(documentTable.title, documentVersionTable.version, documentSectionLinkTable.position),
        catch: this.mapDrizzleToDraBaseError('find', stage, this.logger?.level === 'debug' ? { sectionId } : undefined),
      })

      return rows.map((row) => ({
        ...row,
        documentVersion: Number(row.documentVersion ?? 0),
      })) as DocumentSectionLinkUsageItem[]
    })
  }
  //<==//
}

import { Effect } from 'effect'
import { and, eq } from 'drizzle-orm'
import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig, RepositoryError } from '@aopslab/xf-db'

import { type DocumentSectionLinkUsageItem } from '../../../../application/ports/repository-ports/IRepositoryPortDocumentSectionLink.js'
import { IbmDocumentSectionLink } from '../../../../domain/models/index.js'
import { IRepositoryPortDocumentSectionLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbDocumentSectionLinkDrizzleSqlite, documentSectionLinkTableSqlite } from '../../../db/documentSectionLink/drizzle/drizzle.schema.documentSectionLink.sqlite.js'
import { mapperDocumentSectionLinkDrizzle } from '../../../db/documentSectionLink/drizzle/drizzle.mapper.documentSectionLink.js'
import { documentTableSqlite } from '../../../db/document/drizzle/drizzle.schema.document.sqlite.js'
import { documentVersionTableSqlite } from '../../../db/documentVersion/drizzle/drizzle.schema.documentVersion.sqlite.js'

export class DocumentSectionLinkDrizzleSqliteRepo
  extends DraBaseSqlite<IbmDocumentSectionLink, IdbDocumentSectionLinkDrizzleSqlite, typeof documentSectionLinkTableSqlite>
  implements IRepositoryPortDocumentSectionLink
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentSectionLinkTableSqlite, { mapper: mapperDocumentSectionLinkDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }

  listDocumentSectionLinkUsageBySectionId(sectionId: string): Effect.Effect<DocumentSectionLinkUsageItem[], RepositoryError> {
    const stage = 'DocumentSectionLinkDrizzleSqliteRepo::listDocumentSectionLinkUsageBySectionId'
    return Effect.gen(this, function* () {
      const db = yield* this.getDb()
      const rows = yield* Effect.tryPromise({
        try: async () =>
          db
            .select({
              id: documentSectionLinkTableSqlite.id,
              documentId: documentVersionTableSqlite.documentId,
              documentVersionId: documentSectionLinkTableSqlite.documentVersionId,
              documentVersion: documentVersionTableSqlite.version,
              documentTitle: documentTableSqlite.title,
              sectionId: documentSectionLinkTableSqlite.sectionId,
              position: documentSectionLinkTableSqlite.position,
            })
            .from(documentSectionLinkTableSqlite)
            .innerJoin(
              documentVersionTableSqlite,
              eq(documentSectionLinkTableSqlite.documentVersionId, documentVersionTableSqlite.id),
            )
            .innerJoin(documentTableSqlite, eq(documentVersionTableSqlite.documentId, documentTableSqlite.id))
            .where(
              and(
                eq(documentSectionLinkTableSqlite.sectionId, sectionId),
                eq(documentSectionLinkTableSqlite.tenantId, this.tenantId),
                eq(documentVersionTableSqlite.tenantId, this.tenantId),
                eq(documentTableSqlite.tenantId, this.tenantId),
              ),
            )
            .orderBy(documentTableSqlite.title, documentVersionTableSqlite.version, documentSectionLinkTableSqlite.position),
        catch: this.mapDrizzleToDraBaseError('find', stage, this.logger?.level === 'debug' ? { sectionId } : undefined),
      })

      return rows.map((row) => ({
        ...row,
        documentVersion: Number(row.documentVersion ?? 0),
      })) as DocumentSectionLinkUsageItem[]
    })
  }
}

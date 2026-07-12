import { Effect } from 'effect'
import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmProject } from '../../../../domain/models/index.js'
import { IRepositoryPortProject } from '../../../../application/ports/repository-ports/index.js'
import { IdbProjectDrizzle, projectTable } from '../../../db/project/drizzle/drizzle.schema.project.js'
import { mapperProjectDrizzle } from '../../../db/project/drizzle/drizzle.mapper.project.js'

export class ProjectDrizzleRepo extends DraBase<IbmProject, IdbProjectDrizzle, typeof projectTable> implements IRepositoryPortProject {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(projectTable, { mapper: mapperProjectDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  createPreservingId(dm: IbmProject): Effect.Effect<IbmProject, unknown> {
    const self = this
    return Effect.gen(function* () {
      const db = yield* self.getDb()
      const { createdAt, updatedAt, tenantId, ...rest } = (dm ?? {}) as IbmProject & Record<string, unknown>
      const domainWithTenant = self.withTenantDomain(rest as IbmProject)
      const dbData = yield* Effect.mapError(
        self.toDbEffect(domainWithTenant),
        (error) =>
          self.mapDrizzleToDraBaseError(
            'createPreservingId',
            `${self.constructor.name}::createPreservingId:toDbEffect`,
            self.logger?.level === 'debug' ? { dm: domainWithTenant, error } : undefined,
          )(error),
      )
      const rows = yield* Effect.mapError(
        Effect.tryPromise({
          try: async () => await (db as any).insert(self.table).values(dbData as any).returning().execute(),
          catch: (error) => error,
        }),
        self.mapDrizzleToDraBaseError(
          'createPreservingId',
          `${self.constructor.name}::createPreservingId:drizzleCreate`,
          self.logger?.level === 'debug' ? { dm, dbData } : undefined,
        ),
      )
      const row = Array.isArray(rows) ? rows[0] : undefined
      if (!row) {
        return yield* Effect.fail(
          self.mapDrizzleToDraBaseError(
            'createPreservingId',
            `${self.constructor.name}::createPreservingId:noRecord`,
            self.logger?.level === 'debug' ? { dm, dbData } : undefined,
          )(new Error('No record returned after insert')),
        )
      }
      return yield* Effect.mapError(
        self.toDomainEffect(row as IdbProjectDrizzle),
        (error) =>
          self.mapDrizzleToDraBaseError(
            'createPreservingId',
            `${self.constructor.name}::createPreservingId:toDomainEffect`,
            self.logger?.level === 'debug' ? { dbData: row, error } : undefined,
          )(error),
      )
    })
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmProject>): Effect.Effect<IbmProject | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbProjectDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

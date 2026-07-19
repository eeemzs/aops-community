import { Effect } from 'effect'
import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmScope } from '../../../../domain/models/index.js'
import { IRepositoryPortScope } from '../../../../application/ports/repository-ports/index.js'
import { IdbScopeDrizzle, scopeTable } from '../../../db/scope/drizzle/drizzle.schema.scope.js'
import { mapperScopeDrizzle } from '../../../db/scope/drizzle/drizzle.mapper.scope.js'

export class ScopeDrizzleRepo extends DraBase<IbmScope, IdbScopeDrizzle, typeof scopeTable> implements IRepositoryPortScope {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(scopeTable, { mapper: mapperScopeDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }

  createPreservingId(dm: IbmScope): Effect.Effect<IbmScope, unknown> {
    const self = this
    return Effect.gen(function* () {
      const db = yield* self.getDb()
      const { createdAt, updatedAt, tenantId, ...rest } = (dm ?? {}) as IbmScope & Record<string, unknown>
      const domainWithTenant = self.withTenantDomain(rest as IbmScope)
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
          try: async () => await ((self.tx() as any) ?? db).insert(self.table).values(dbData as any).returning().execute(),
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
        self.toDomainEffect(row as IdbScopeDrizzle),
        (error) =>
          self.mapDrizzleToDraBaseError(
            'createPreservingId',
            `${self.constructor.name}::createPreservingId:toDomainEffect`,
            self.logger?.level === 'debug' ? { dbData: row, error } : undefined,
          )(error),
      )
    })
  }
}

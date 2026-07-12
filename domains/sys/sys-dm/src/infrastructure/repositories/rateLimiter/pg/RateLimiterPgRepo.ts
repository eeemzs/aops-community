// External dependencies
import { XfLogger } from '@aopslab/xf-logger';
import { DraBase } from '@aopslab/xf-db-drizzle';
import { Effect } from 'effect'
import { successLegacy, failureLegacy, XfErrorDomain } from '@aopslab/xf-core'
import { and, eq } from 'drizzle-orm';

// Domain imports
import { IbmRateLimiter } from '../../../../domain/models/index.js';

// Application layer imports
import { IRepositoryPortRateLimiter } from '../../../../application/ports/repository-ports/IRepositoryPortRateLimiter.js';
import { RateLimitRule } from '../../../../application/ports/types.js';
import { RateLimiterResult } from '../../../../application/ports/types.js';

// Infrastructure imports
import { IdbRateLimiterDrizzlePg, pgRateLimiter } from '../../../db/rateLimiter/pg/index.js';
import { mapperRateLimiterPg } from '../../../db/rateLimiter/pg/pg.mapper.rateLimiter.js';
import {
  rateLimiterRepoCommonCheckRateLimiter,
  rateLimiterCommonNewAttempt,
  rateLimiterRepoCommonCleanRateLimiter,
  RateLimitFindSingleAdapter,
  RateLimitDeleteByIdAdapter,
  RateLimitDeleteManyAdapter
} from '../rateLimiter.common.js';
import { RepositoryConfig } from '@aopslab/xf-db';

export class RateLimiterPgRepo
  extends DraBase<IbmRateLimiter, IdbRateLimiterDrizzlePg, typeof pgRateLimiter>
  implements IRepositoryPortRateLimiter
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    // const db = getDrizzleDbSingleton()
    // if (!db) {
    //   throw new Error('Drizzle database connection not initialized')
    // }

    super(pgRateLimiter, {
      mapper: mapperRateLimiterPg,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig
    });
  }

  checkRateLimiter(key: string, scope: string): Effect.Effect<RateLimiterResult, Error> {
    return rateLimiterRepoCommonCheckRateLimiter(this.findSingleAdapter, key, scope).pipe(
      Effect.mapError((e): Error => e as unknown as Error)
    )
  }

  newAttempt(key: string, scope: string, rule: RateLimitRule): Effect.Effect<RateLimiterResult, Error> {
    return rateLimiterCommonNewAttempt(
      this.findSingleAdapter, // RateLimitFindSingleAdapter
      this.createAdapter, // RateLimitCreateAdapter
      this.updateByIdAdapter, // RateLimitUpdateByIdAdapter
      this.deleteByIdAdapter, // RateLimitDeleteByIdAdapter
      key,
      scope,
      rule,
      this.logger
    ).pipe(Effect.mapError((e): Error => e as unknown as Error))
  }

  // Adapter fonksiyonunu private olarak tanımlayın
  private findSingleAdapter: RateLimitFindSingleAdapter<IbmRateLimiter> = async (key: string, scope: string) => {
    const eff = this.findSingle({ matchEq: { key, scope } });
    return await Effect.runPromise(
      eff.pipe(
        Effect.match({
          onSuccess: (dm) => (dm ? successLegacy<IbmRateLimiter>(dm) : failureLegacy<IbmRateLimiter>({ messageText: 'not found', opts: { domain: XfErrorDomain.Service } })),
          onFailure: (err) => failureLegacy<IbmRateLimiter>({ messageText: 'findSingle failed', opts: { domain: XfErrorDomain.Service, exception: err } })
        })
      )
    )
  };

  private createAdapter = async (dm: IbmRateLimiter) => {
    const eff = this.create(dm);
    return await Effect.runPromise(
      eff.pipe(
        Effect.match({
          onSuccess: (created) => successLegacy<IbmRateLimiter>(created),
          onFailure: (err) => failureLegacy<IbmRateLimiter>({ messageText: 'create failed', opts: { domain: XfErrorDomain.Service, exception: err } })
        })
      )
    )
  };

  private updateByIdAdapter = async (id: string, dm: IbmRateLimiter) => {
    const eff = this.updateById(id, dm);
    return await Effect.runPromise(
      eff.pipe(
        Effect.match({
          onSuccess: (updated) => successLegacy<IbmRateLimiter>(updated),
          onFailure: (err) => failureLegacy<IbmRateLimiter>({ messageText: 'updateById failed', opts: { domain: XfErrorDomain.Service, exception: err } })
        })
      )
    )
  };

  private deleteByIdAdapter: RateLimitDeleteByIdAdapter = async (id: string) => {
    const eff = this.deleteById(id);
    return await Effect.runPromise(
      eff.pipe(
        Effect.match({
          onSuccess: (n) => successLegacy<number>(n),
          onFailure: (err) => failureLegacy<number>({ messageText: 'deleteById failed', opts: { domain: XfErrorDomain.Service, exception: err } })
        })
      )
    )
  };

  private deleteManyAdapter: RateLimitDeleteManyAdapter = async (criteria: any) => {
    const eff = criteria.key && criteria.scope
      ? this.deleteMany({ match: and(eq(pgRateLimiter.key, criteria.key), eq(pgRateLimiter.scope, criteria.scope)) })
      : this.deleteMany({});
    return await Effect.runPromise(
      eff.pipe(
        Effect.match({
          onSuccess: (n) => successLegacy<number>(n),
          onFailure: (err) => failureLegacy<number>({ messageText: 'deleteMany failed', opts: { domain: XfErrorDomain.Service, exception: err } })
        })
      )
    )
  };

  cleanRateLimiter(key: string, scope: string): Effect.Effect<number, Error> {
    return rateLimiterRepoCommonCleanRateLimiter(this.deleteManyAdapter, key, scope).pipe(
      Effect.mapError((e): Error => e as unknown as Error)
    )
  }

  // Use base cleanupAll
}

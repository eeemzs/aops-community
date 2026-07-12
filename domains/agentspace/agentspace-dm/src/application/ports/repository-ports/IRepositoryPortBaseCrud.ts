import type { Ibm } from '@aopslab/xf-bm'
import type { DbQueryOptions, RepositoryError } from '@aopslab/xf-db'
import type { SQL } from 'drizzle-orm'
import { Effect } from 'effect'

export type RepositoryMatchEq<TDbModel> = Partial<Record<keyof TDbModel, unknown>>

export interface RepositoryFindParams<TDbModel> {
  matchEq?: RepositoryMatchEq<TDbModel>
  match?: SQL<unknown>
  options?: DbQueryOptions<TDbModel>
}

export interface IRepositoryPortBaseCrud<TDomainModel extends Ibm, TDbModel, E = RepositoryError> {
  create(dm: TDomainModel): Effect.Effect<TDomainModel, E>
  insertMany(domainModels: TDomainModel[]): Effect.Effect<TDomainModel[], E>
  find(params: RepositoryFindParams<TDbModel>): Effect.Effect<TDomainModel[], E>
  findById(id: string, options?: DbQueryOptions<TDomainModel>): Effect.Effect<TDomainModel, E>
  updateById(id: string, dm: TDomainModel): Effect.Effect<TDomainModel, E>
  patchById(id: string, patch: Partial<TDomainModel>): Effect.Effect<TDomainModel, E>
  upsert(dm: TDomainModel, matchEq: RepositoryMatchEq<TDbModel>): Effect.Effect<TDomainModel, E>
  deleteById(id: string): Effect.Effect<number, E>
  deleteByIdWithMatch(id: string, matchEq?: RepositoryMatchEq<TDbModel>): Effect.Effect<number, E>
  deleteMany(params: { matchEq?: RepositoryMatchEq<TDbModel>; match?: SQL<unknown> }): Effect.Effect<number, E>
  cleanupAll(): Effect.Effect<number, E>
}

import { Effect } from 'effect'
import { ProjectPathServiceError } from '../../errors/ProjectPathServiceError.js'
import { IbmProjectPath, IbmProjectPathInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IProjectPathServicePort {
  getById(id: string, options?: DbQueryOptions<IbmProjectPath>): Effect.Effect<IbmProjectPath | null, ProjectPathServiceError>
  create(data: IbmProjectPathInsert): Effect.Effect<IbmProjectPath, ProjectPathServiceError>
  listProjectPaths(
    filter?: Partial<IbmProjectPath>,
    options?: DbQueryOptions<IbmProjectPath>
  ): Effect.Effect<IbmProjectPath[], ProjectPathServiceError>
  updateProjectPath(id: string, patch: Partial<IbmProjectPath>): Effect.Effect<IbmProjectPath, ProjectPathServiceError>
  upsertProjectPath(data: IbmProjectPathInsert): Effect.Effect<IbmProjectPath, ProjectPathServiceError>
  removeProjectPath(id: string): Effect.Effect<void, ProjectPathServiceError>
}

export interface IProjectPathLookupPort {
  getById(id: string): Effect.Effect<IbmProjectPath | null, ProjectPathServiceError>
}

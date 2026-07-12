import { Effect } from 'effect'
import { PromptVersionServiceError } from '../../errors/PromptVersionServiceError.js'
import { IbmPromptVersion, IbmPromptVersionInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IPromptVersionServicePort {
  getById(id: string, options?: DbQueryOptions<IbmPromptVersion>): Effect.Effect<IbmPromptVersion | null, PromptVersionServiceError>
  create(data: IbmPromptVersionInsert): Effect.Effect<IbmPromptVersion, PromptVersionServiceError>
  getPromptVersion(id: string, options?: DbQueryOptions<IbmPromptVersion>): Effect.Effect<IbmPromptVersion | null, PromptVersionServiceError>
  listPromptVersions(
    filter?: Partial<IbmPromptVersion>,
    options?: DbQueryOptions<IbmPromptVersion>
  ): Effect.Effect<IbmPromptVersion[], PromptVersionServiceError>
  updatePromptVersion(id: string, patch: Partial<IbmPromptVersion>): Effect.Effect<IbmPromptVersion, PromptVersionServiceError>
  removePromptVersion(id: string): Effect.Effect<void, PromptVersionServiceError>
  publishPromptVersion(
    id: string,
    publishedAt?: Date,
    updatedBy?: string
  ): Effect.Effect<IbmPromptVersion, PromptVersionServiceError>
}

export interface IPromptVersionLookupPort {
  getById(id: string): Effect.Effect<IbmPromptVersion | null, PromptVersionServiceError>
}

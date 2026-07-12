import { Effect } from 'effect'
import { PromptServiceError } from '../../errors/PromptServiceError.js'
import { IbmPrompt, IbmPromptInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'

export type PromptListFilter = Partial<IbmPrompt> & {
  scopeResolution?: ScopeResolution
}

export interface IPromptServicePort {
  getById(id: string, options?: DbQueryOptions<IbmPrompt>): Effect.Effect<IbmPrompt | null, PromptServiceError>
  create(data: IbmPromptInsert): Effect.Effect<IbmPrompt, PromptServiceError>
  getPrompt(id: string, options?: DbQueryOptions<IbmPrompt>): Effect.Effect<IbmPrompt | null, PromptServiceError>
  listPrompts(filter?: PromptListFilter, options?: DbQueryOptions<IbmPrompt>): Effect.Effect<IbmPrompt[], PromptServiceError>
  updatePrompt(id: string, patch: Partial<IbmPrompt>): Effect.Effect<IbmPrompt, PromptServiceError>
  removePrompt(id: string): Effect.Effect<void, PromptServiceError>
}

export interface IPromptLookupPort {
  getById(id: string): Effect.Effect<IbmPrompt | null, PromptServiceError>
}

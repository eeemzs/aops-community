import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'
import { ExperienceItemServiceError } from '../../errors/ExperienceItemServiceError.js'
import { IbmExperienceItem, IbmExperienceItemInsert } from '../../../domain/models/index.js'

export type ExperienceItemListFilter = Partial<IbmExperienceItem> & {
  scopeResolution?: ScopeResolution
}

export interface IExperienceItemServicePort {
  getById(id: string, options?: DbQueryOptions<IbmExperienceItem>): Effect.Effect<IbmExperienceItem | null, ExperienceItemServiceError>
  create(data: IbmExperienceItemInsert): Effect.Effect<IbmExperienceItem, ExperienceItemServiceError>
  getExperienceItem(id: string, options?: DbQueryOptions<IbmExperienceItem>): Effect.Effect<IbmExperienceItem | null, ExperienceItemServiceError>
  addExperienceItem(data: IbmExperienceItemInsert): Effect.Effect<IbmExperienceItem, ExperienceItemServiceError>
  updateExperienceItem(id: string, patch: Partial<IbmExperienceItem>): Effect.Effect<IbmExperienceItem, ExperienceItemServiceError>
  listExperienceItems(filter?: ExperienceItemListFilter, options?: DbQueryOptions<IbmExperienceItem>): Effect.Effect<IbmExperienceItem[], ExperienceItemServiceError>
  removeExperienceItem(id: string): Effect.Effect<void, ExperienceItemServiceError>
}

export interface IExperienceItemLookupPort {
  getById(id: string): Effect.Effect<IbmExperienceItem | null, ExperienceItemServiceError>
}

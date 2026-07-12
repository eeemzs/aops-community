import { Effect } from 'effect'
import { SprintItemServiceError } from '../../errors/SprintItemServiceError.js'
import { IbmSprintItem, IbmSprintItemInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export type SprintItemCreateInput = Omit<IbmSprintItemInsert, 'position'> & { position?: number }

export interface ISprintItemServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSprintItem>): Effect.Effect<IbmSprintItem | null, SprintItemServiceError>
  create(data: IbmSprintItemInsert): Effect.Effect<IbmSprintItem, SprintItemServiceError>
  addSprintItem(data: SprintItemCreateInput): Effect.Effect<IbmSprintItem, SprintItemServiceError>
  updateSprintItem(id: string, patch: Partial<IbmSprintItem>): Effect.Effect<IbmSprintItem, SprintItemServiceError>
  listSprintItems(
    filter?: Partial<IbmSprintItem>,
    options?: DbQueryOptions<IbmSprintItem>
  ): Effect.Effect<IbmSprintItem[], SprintItemServiceError>
  reorderSprintItems(sprintId: string, orderedItemIds: string[]): Effect.Effect<number, SprintItemServiceError>
  closeSprintItem(id: string, closedAt?: Date): Effect.Effect<IbmSprintItem, SprintItemServiceError>
  removeSprintItem(id: string): Effect.Effect<void, SprintItemServiceError>
}

export interface ISprintItemLookupPort {
  getById(id: string): Effect.Effect<IbmSprintItem | null, SprintItemServiceError>
}

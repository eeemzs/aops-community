import { Effect } from 'effect'
import { SprintServiceError } from '../../errors/SprintServiceError.js'
import { IbmSprint, IbmSprintInsert, IbmSprintItem } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { SprintItemCreateInput } from './ISprintItemServicePort.js'

export interface ISprintServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSprint>): Effect.Effect<IbmSprint | null, SprintServiceError>
  create(data: IbmSprintInsert): Effect.Effect<IbmSprint, SprintServiceError>
  getSprint(id: string, options?: DbQueryOptions<IbmSprint>): Effect.Effect<IbmSprint | null, SprintServiceError>
  listSprints(
    filter?: Partial<IbmSprint>,
    options?: DbQueryOptions<IbmSprint>
  ): Effect.Effect<IbmSprint[], SprintServiceError>
  updateSprint(id: string, patch: Partial<IbmSprint>): Effect.Effect<IbmSprint, SprintServiceError>
  activateSprint(id: string): Effect.Effect<IbmSprint, SprintServiceError>
  completeSprint(id: string): Effect.Effect<IbmSprint, SprintServiceError>
  supersedeSprint(id: string): Effect.Effect<IbmSprint, SprintServiceError>
  removeSprint(id: string): Effect.Effect<void, SprintServiceError>
  addSprintItem(data: SprintItemCreateInput): Effect.Effect<IbmSprintItem, SprintServiceError>
  updateSprintItem(id: string, patch: Partial<IbmSprintItem>): Effect.Effect<IbmSprintItem, SprintServiceError>
  reorderSprintItems(sprintId: string, orderedItemIds: string[]): Effect.Effect<number, SprintServiceError>
  closeSprintItem(id: string, closedAt?: Date): Effect.Effect<IbmSprintItem, SprintServiceError>
}

export interface ISprintLookupPort {
  getById(id: string): Effect.Effect<IbmSprint | null, SprintServiceError>
}

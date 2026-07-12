import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { SprintGroupServiceError } from '../../errors/SprintGroupServiceError.js'
import { IbmSprintGroup, IbmSprintGroupInsert } from '../../../domain/models/index.js'

export type SprintGroupCreateInput = Omit<IbmSprintGroupInsert, 'position'> & {
  position?: number
}

export type SprintGroupMoveInput = {
  sprintId?: string
  position?: number
}

export type SprintGroupCopyInput = {
  sprintId?: string
  name?: string
  description?: string | null
  position?: number
}

export interface ISprintGroupServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSprintGroup>): Effect.Effect<IbmSprintGroup | null, SprintGroupServiceError>
  create(data: IbmSprintGroupInsert): Effect.Effect<IbmSprintGroup, SprintGroupServiceError>
  addGroup(input: SprintGroupCreateInput): Effect.Effect<IbmSprintGroup, SprintGroupServiceError>
  updateGroup(id: string, patch: Partial<IbmSprintGroup>): Effect.Effect<IbmSprintGroup, SprintGroupServiceError>
  moveGroup(id: string, input: SprintGroupMoveInput): Effect.Effect<IbmSprintGroup, SprintGroupServiceError>
  copyGroup(id: string, input: SprintGroupCopyInput): Effect.Effect<IbmSprintGroup, SprintGroupServiceError>
  listGroups(filter?: Partial<IbmSprintGroup>, options?: DbQueryOptions<IbmSprintGroup>): Effect.Effect<IbmSprintGroup[], SprintGroupServiceError>
  reorderGroups(sprintId: string, orderedGroupIds: string[]): Effect.Effect<number, SprintGroupServiceError>
  removeGroup(id: string): Effect.Effect<void, SprintGroupServiceError>
  //==> custom-methods
  //<==//
}

export interface ISprintGroupLookupPort {
  getById(id: string): Effect.Effect<IbmSprintGroup | null, SprintGroupServiceError>
}

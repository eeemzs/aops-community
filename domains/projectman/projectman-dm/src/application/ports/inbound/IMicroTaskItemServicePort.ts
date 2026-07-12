import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { MicroTaskItemServiceError } from '../../errors/MicroTaskItemServiceError.js'
import { IbmMicroTaskItem, IbmMicroTaskItemInsert } from '../../../domain/models/index.js'

export type MicroTaskItemCreateInput = Omit<IbmMicroTaskItemInsert, 'position'> & {
  position?: number
}

export type MicroTaskItemMoveInput = {
  projectId?: string
  sprintId?: string | null
  sprintGroupId?: string | null
  kanbanTaskId?: string | null
  position?: number
}

export type MicroTaskItemCopyInput = MicroTaskItemMoveInput & {
  title?: string
  status?: string
  notes?: string | null
  meta?: unknown
  openedAt?: Date | null
  closedAt?: Date | null
}

export interface IMicroTaskItemServicePort {
  getById(id: string, options?: DbQueryOptions<IbmMicroTaskItem>): Effect.Effect<IbmMicroTaskItem | null, MicroTaskItemServiceError>
  create(data: IbmMicroTaskItemInsert): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError>
  createMicroTask(input: MicroTaskItemCreateInput): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError>
  updateMicroTask(id: string, patch: Partial<IbmMicroTaskItem>): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError>
  moveMicroTask(id: string, input: MicroTaskItemMoveInput): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError>
  copyMicroTask(id: string, input: MicroTaskItemCopyInput): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError>
  listMicroTasks(filter?: Partial<IbmMicroTaskItem>, options?: DbQueryOptions<IbmMicroTaskItem>): Effect.Effect<IbmMicroTaskItem[], MicroTaskItemServiceError>
  reorderMicroTasksInGroup(sprintGroupId: string, orderedTaskIds: string[]): Effect.Effect<number, MicroTaskItemServiceError>
  removeMicroTask(id: string): Effect.Effect<void, MicroTaskItemServiceError>
  //==> custom-methods
  //<==//
}

export interface IMicroTaskItemLookupPort {
  getById(id: string): Effect.Effect<IbmMicroTaskItem | null, MicroTaskItemServiceError>
}

import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { SprintServiceError } from '../../errors/SprintServiceError.js'
import { SprintDetail, SprintPhasePlanInput } from '../../../domain/dto/index.js'
import { MicroTaskStatus } from '../../../domain/types.js'
import { IbmSprint, IbmSprintInsert } from '../../../domain/models/index.js'

export type SprintCreateInput = IbmSprintInsert & {
  phases?: SprintPhasePlanInput[]
}

export type SprintMoveInput = {
  projectId?: string
}

export type SprintCopyInput = {
  projectId?: string
  name?: string
  goal?: string | null
}

export type SprintUpdatePlanInput = Partial<Omit<IbmSprintInsert, 'scopeId' | 'projectId' | 'kanbanTaskId'>> & {
  phases?: SprintPhasePlanInput[]
  expectedUpdatedAt?: string | Date | null
}

export type SprintAddMicrotaskInput = {
  phaseId?: string
  phase?: string
  title: string
  status?: MicroTaskStatus
  position?: number
  notes?: string | null
  createdBy?: string
  updatedBy?: string
}

export type SprintUpdateMicrotaskInput = {
  microtaskId: string
  title?: string
  status?: MicroTaskStatus
  position?: number
  notes?: string | null
  updatedBy?: string
}

export type SprintUpdateMicrotaskStatusInput = {
  microtaskId: string
  status: MicroTaskStatus
  updatedBy?: string
}

export type SprintDeleteMicrotaskInput = {
  microtaskId: string
  updatedBy?: string
}

export interface ISprintServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSprint>): Effect.Effect<SprintDetail | null, SprintServiceError>
  create(data: IbmSprintInsert): Effect.Effect<IbmSprint, SprintServiceError>
  createSprint(input: SprintCreateInput): Effect.Effect<SprintDetail, SprintServiceError>
  updateSprint(id: string, patch: Partial<IbmSprint>): Effect.Effect<SprintDetail, SprintServiceError>
  archiveSprint(id: string): Effect.Effect<SprintDetail, SprintServiceError>
  unarchiveSprint(id: string): Effect.Effect<SprintDetail, SprintServiceError>
  updatePlan(id: string, input: SprintUpdatePlanInput): Effect.Effect<SprintDetail, SprintServiceError>
  addMicrotask(id: string, input: SprintAddMicrotaskInput): Effect.Effect<SprintDetail, SprintServiceError>
  updateMicrotask(id: string, input: SprintUpdateMicrotaskInput): Effect.Effect<SprintDetail, SprintServiceError>
  updateMicrotaskStatus(id: string, input: SprintUpdateMicrotaskStatusInput): Effect.Effect<SprintDetail, SprintServiceError>
  deleteMicrotask(id: string, input: SprintDeleteMicrotaskInput): Effect.Effect<SprintDetail, SprintServiceError>
  moveSprint(id: string, input: SprintMoveInput): Effect.Effect<IbmSprint, SprintServiceError>
  copySprint(id: string, input: SprintCopyInput): Effect.Effect<IbmSprint, SprintServiceError>
  listSprints(filter?: Partial<IbmSprint>, options?: DbQueryOptions<IbmSprint>, listOptions?: { includeArchived?: boolean }): Effect.Effect<SprintDetail[], SprintServiceError>
  removeSprint(id: string): Effect.Effect<void, SprintServiceError>
  //==> custom-methods
  //<==//
}

export interface ISprintLookupPort {
  getById(id: string): Effect.Effect<SprintDetail | null, SprintServiceError>
}

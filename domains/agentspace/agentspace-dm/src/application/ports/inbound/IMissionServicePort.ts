import { Effect } from 'effect'
import { MissionServiceError } from '../../errors/MissionServiceError.js'
import { IbmMission, IbmMissionInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { MissionStatus, ScopeResolution } from '../../../domain/types.js'

export type MissionListFilter = Partial<IbmMission> & {
  scopeResolution?: ScopeResolution
}

export type MissionCreateInput = Omit<IbmMissionInsert, 'status'> & {
  status?: MissionStatus
}

export type MissionResumePackOptions = {
  depth?: 'light' | 'standard'
  limit?: number
}

export type MissionResumeCheckpointSummary = {
  id?: string
  kind?: string
  checkpointAs?: string
  current: boolean
  superseded: boolean
  supersedes?: string
  summary?: string
  position?: string
  doneWork?: string[]
  nextSteps?: string[]
  sourceRefs?: unknown[]
  anchors?: unknown
  createdAt?: string
  updatedAt?: string
}

export type MissionResumeCheckpointProjection = {
  current?: MissionResumeCheckpointSummary
  recent: MissionResumeCheckpointSummary[]
  total: number
}

export type MissionResumePack = {
  schemaVersion: 1
  generatedAt: string
  mission: {
    id: string
    slug?: string
    objective: string
    status: MissionStatus
    policy?: Record<string, unknown>
    refs: unknown[]
  }
  activePlan: {
    ref?: unknown
    sprintId?: string
    currentSlice?: Record<string, unknown>
    nextSlice?: Record<string, unknown>
    progress?: Record<string, unknown>
  }
  memory: unknown[]
  checkpoints: MissionResumeCheckpointProjection
  reviews: unknown[]
  issues: unknown[]
  chat: {
    unread: number
    lastN: unknown[]
  }
}

export interface IMissionServicePort {
  getById(id: string, options?: DbQueryOptions<IbmMission>): Effect.Effect<IbmMission | null, MissionServiceError>
  create(data: IbmMissionInsert): Effect.Effect<IbmMission, MissionServiceError>
  createMission(data: MissionCreateInput): Effect.Effect<IbmMission, MissionServiceError>
  updateMission(id: string, patch: Partial<IbmMissionInsert>): Effect.Effect<IbmMission, MissionServiceError>
  removeMission(id: string): Effect.Effect<void, MissionServiceError>
  listMissions(filter?: MissionListFilter, options?: DbQueryOptions<IbmMission>): Effect.Effect<IbmMission[], MissionServiceError>
  buildResumePack(id: string, options?: MissionResumePackOptions): Effect.Effect<MissionResumePack, MissionServiceError>
}

export interface IMissionLookupPort {
  getById(id: string): Effect.Effect<IbmMission | null, MissionServiceError>
}

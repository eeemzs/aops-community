import type { IbmMicroTaskItem, IbmSprint, IbmSprintGroup } from '../models/index.js'
import type { MicroTaskStatus, SprintStatus } from '../types.js'

export type SprintProgress = {
  completed: number
  actionable: number
  total: number
  ratio: number
}

export type SprintMicrotask = IbmMicroTaskItem

export type SprintPhase = IbmSprintGroup & {
  status: SprintStatus
  progress: SprintProgress
  microtasks: SprintMicrotask[]
}

export type SprintDetail = IbmSprint & {
  status: SprintStatus
  progress: SprintProgress
  phases: SprintPhase[]
}

export type SprintMicrotaskPlanInput = {
  id?: string
  title: string
  status?: MicroTaskStatus
  position?: number
  notes?: string | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
}

export type SprintPhasePlanInput = {
  id?: string
  name: string
  description?: string | null
  position?: number
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  microtasks?: SprintMicrotaskPlanInput[]
}

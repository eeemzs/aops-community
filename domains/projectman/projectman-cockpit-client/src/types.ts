/**
 * Read-model shapes for the Projectman cockpit. Mirrors the projectman-dm zod
 * schemas, but kept as a local view contract so the cockpit never imports the
 * domain package — it consumes only the hosted REST surface. Fields the cockpit
 * does not render are typed loosely (the server may add more).
 */
export type PmBoard = {
  id: string
  scopeId: string
  name: string
  slug?: string
  description?: string
  position: number
  createdAt: string
  updatedAt: string
}

export type PmMicrotask = {
  id: string
  title: string
  status: string
  position: number
  notes?: string
}

export type PmSprintPhase = {
  id: string
  name: string
  microtasks: PmMicrotask[]
}

export type PmSprint = {
  id: string
  scopeId: string
  kanbanTaskId: string
  name: string
  goal: string
  references?: string[]
  scope?: string[]
  validationPlan?: string[]
  notes?: string
  phases?: PmSprintPhase[]
  createdAt: string
  updatedAt: string
}

export type PmImplementationPlanMicrotask = {
  id: string
  title: string
  status?: string | null
  position?: number | null
  notes?: string | null
}

export type PmImplementationPlanPhase = {
  id: string
  name: string
  description?: string | null
  position?: number | null
  microtasks?: PmImplementationPlanMicrotask[]
}

export type PmImplementationPlan = {
  id: string
  localId?: string
  scopeId?: string
  kanbanTaskId?: string | null
  name: string
  slug?: string | null
  goal?: string | null
  status?: string | null
  references?: string[] | null
  scope?: string[] | null
  validationPlan?: string[] | null
  notes?: string | null
  phases?: PmImplementationPlanPhase[]
  storage?: string | null
  syncState?: string | null
  createdAt?: string
  updatedAt?: string
}

export type PmKanbanTask = {
  id: string
  scopeId: string
  title: string
  status?: string
  boardId?: string
  boardColumnKey?: string
  sprintId?: string
  position?: number
  createdAt: string
  updatedAt: string
}

export type PmIssue = {
  id: string
  scopeId: string
  title: string
  status: string
  severity?: string
  source?: string
  sprintId?: string | null
  kanbanTaskId?: string | null
  reviewRequestId?: string | null
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export type PmFeedback = {
  id: string
  scopeId: string
  title: string
  status: string
  type?: string
  severity?: string
  source?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export type PmReviewResult = {
  id: string
  reviewer: string
  outcome: string
  summary: string
  positives?: string[]
  concerns?: string[]
  objections?: string[]
  issueIds?: string[]
  createdAt: string
}

export type PmReviewRequest = {
  id: string
  scopeId: string
  title: string
  description?: string
  reviewScope?: string
  instructions?: string
  status: string
  priority: string
  source: string
  parentReviewRequestId?: string | null
  rootReviewRequestId?: string | null
  sprintId?: string | null
  kanbanTaskId?: string | null
  targetAgent?: string
  requestedBy?: string
  results?: PmReviewResult[]
  tags?: string[]
  createdAt: string
  updatedAt: string
}

/** Common list filters; scopeId narrows to one project/workspace. */
export type PmListFilter = {
  scopeId?: string
  project?: string
} & Record<string, string | undefined>

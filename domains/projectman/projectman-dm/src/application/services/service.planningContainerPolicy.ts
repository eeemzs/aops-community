type NullableId = string | null | undefined

export interface PlanningContainerState {
  projectId: string | null
  sprintId: string | null
  sprintGroupId: string | null
  kanbanTaskId: string | null
}

export interface PlanningContainerEvidence {
  sprintProjectId?: NullableId
  sprintGroupSprintId?: NullableId
  kanbanTaskProjectId?: NullableId
}

export interface PlanningContainerStateInput {
  source: PlanningContainerState
  requested?: Partial<PlanningContainerState>
  evidence?: PlanningContainerEvidence
}

export interface PlanningLinkedRecordPatch extends Record<string, string | null | undefined> {
  projectId: string | null
  sprintId?: string | null
  kanbanTaskId?: string | null
}

const normalizeId = (value: NullableId): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export function resolvePlanningContainerState(input: PlanningContainerStateInput): PlanningContainerState {
  const requested = input.requested ?? {}
  const evidence = input.evidence ?? {}

  let projectId = normalizeId(
    Object.prototype.hasOwnProperty.call(requested, 'projectId')
      ? requested.projectId
      : input.source.projectId,
  )
  let sprintId = normalizeId(
    Object.prototype.hasOwnProperty.call(requested, 'sprintId')
      ? requested.sprintId
      : input.source.sprintId,
  )
  let sprintGroupId = normalizeId(
    Object.prototype.hasOwnProperty.call(requested, 'sprintGroupId')
      ? requested.sprintGroupId
      : input.source.sprintGroupId,
  )
  let kanbanTaskId = normalizeId(
    Object.prototype.hasOwnProperty.call(requested, 'kanbanTaskId')
      ? requested.kanbanTaskId
      : input.source.kanbanTaskId,
  )

  const taskProjectId = normalizeId(evidence.kanbanTaskProjectId)
  const sprintGroupSprintId = normalizeId(evidence.sprintGroupSprintId)
  const sprintProjectId = normalizeId(evidence.sprintProjectId)

  if (taskProjectId) {
    projectId = taskProjectId
  }

  if (sprintGroupSprintId) {
    sprintId = sprintGroupSprintId
  }

  if (sprintId && sprintProjectId) {
    projectId = sprintProjectId
  }

  if (sprintId && sprintProjectId && sprintProjectId !== projectId) {
    sprintId = null
    sprintGroupId = null
  }

  if (sprintGroupId && sprintGroupSprintId && sprintGroupSprintId !== sprintId) {
    sprintGroupId = null
  }

  if (kanbanTaskId && taskProjectId && taskProjectId !== projectId) {
    kanbanTaskId = null
  }

  return {
    projectId,
    sprintId,
    sprintGroupId,
    kanbanTaskId,
  }
}

export function buildTaskProjectBoundaryScope(projectId: string, kanbanTaskId: string): PlanningContainerState {
  return {
    projectId: normalizeId(projectId),
    sprintId: null,
    sprintGroupId: null,
    kanbanTaskId: normalizeId(kanbanTaskId),
  }
}

export function buildTaskProjectBoundaryRecordPatch(projectId: string, kanbanTaskId: string): PlanningLinkedRecordPatch {
  const scope = buildTaskProjectBoundaryScope(projectId, kanbanTaskId)
  return {
    projectId: scope.projectId,
    sprintId: scope.sprintId,
    kanbanTaskId: scope.kanbanTaskId,
  }
}

export function buildMicroTaskRecordPatch(target: PlanningContainerState): PlanningLinkedRecordPatch {
  return {
    projectId: normalizeId(target.projectId),
    sprintId: normalizeId(target.sprintId),
    kanbanTaskId: normalizeId(target.kanbanTaskId),
  }
}

export function buildSprintProjectBoundaryDirectRecordPatch(
  projectId: string,
  linkedTaskId?: NullableId,
): PlanningLinkedRecordPatch {
  const normalizedTaskId = normalizeId(linkedTaskId)
  return {
    projectId: normalizeId(projectId),
    ...(normalizedTaskId ? { kanbanTaskId: null } : {}),
  }
}

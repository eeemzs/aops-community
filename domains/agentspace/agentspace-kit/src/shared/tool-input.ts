type ToolInputRecord = Record<string, unknown>

export const PROJECT_CONTEXT_KEYS = ['projectId', 'scopeId'] as const

export function toRecord(input: unknown): ToolInputRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as ToolInputRecord
}

export function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function hasNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as ToolInputRecord).length > 0
  return true
}

export function resolveProjectContextValue(input: ToolInputRecord): string | undefined {
  return normalizeNonEmpty(input.projectId) ?? normalizeNonEmpty(input.scopeId)
}

export function resolveScopeContextValue(input: ToolInputRecord): string | undefined {
  return normalizeNonEmpty(input.scopeId) ?? normalizeNonEmpty(input.projectId)
}

export function isProjectContextArgName(argName: string): boolean {
  return (
    argName === 'projectId' ||
    argName === 'scopeId' ||
    argName === 'data.projectId' ||
    argName === 'data.scopeId'
  )
}

export function toMissingRequiredArgToken(argName: string): string {
  if (isProjectContextArgName(argName)) return 'project_context_required'
  return `missing_required_arg:${argName}`
}

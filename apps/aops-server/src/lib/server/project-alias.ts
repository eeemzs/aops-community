export type ProjectAliasInput = {
  projectId?: unknown
  projectName?: unknown
  project?: unknown
}

export function normalizeNonEmptyProjectText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function resolveProjectAliasValue(input: ProjectAliasInput): string | undefined {
  return (
    normalizeNonEmptyProjectText(input.projectId) ??
    normalizeNonEmptyProjectText(input.projectName) ??
    normalizeNonEmptyProjectText(input.project)
  )
}

export function resolveProjectAliasFromHeaders(headers: Headers): string | undefined {
  return (
    normalizeNonEmptyProjectText(headers.get('x-project-id')) ??
    normalizeNonEmptyProjectText(headers.get('x-project-name'))
  )
}

export function hasProjectAliasValue(input: ProjectAliasInput, contextProjectId?: unknown): boolean {
  return Boolean(resolveProjectAliasValue(input) ?? normalizeNonEmptyProjectText(contextProjectId))
}

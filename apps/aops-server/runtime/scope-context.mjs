// @ts-nocheck
export function toNonEmptyString(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function unwrapData(value) {
  const record = toRecord(value)
  if (Object.prototype.hasOwnProperty.call(record, 'data')) {
    return record.data
  }
  return value
}

export function normalizeScopeResolution(value) {
  return value === 'cascade' || value === 'explicit' ? value : undefined
}

export function createAgentspaceScopeResolver(params) {
  const projectCache = new Map()
  const runAgentspaceOperation = params.runAgentspaceOperation
  const normalizeScopeId = params.normalizeScopeId ?? toNonEmptyString

  async function resolveProjectContext(projectId) {
    const normalizedProjectId = toNonEmptyString(projectId)
    if (!normalizedProjectId) {
      return {
        projectId: undefined,
        scopeId: undefined,
      }
    }

    if (projectCache.has(normalizedProjectId)) {
      return projectCache.get(normalizedProjectId)
    }

    const projectRecord = toRecord(
      unwrapData(
        await runAgentspaceOperation('project.get-by-id', {
          id: normalizedProjectId,
        }).catch(() => null),
      ),
    )

    const context = {
      projectId: normalizedProjectId,
      scopeId: normalizeScopeId(projectRecord.scopeId) ?? toNonEmptyString(projectRecord.id) ?? normalizedProjectId,
    }
    projectCache.set(normalizedProjectId, context)
    return context
  }

  async function resolveRequestScope(requestContext = {}, options = {}) {
    const explicitScopeId = normalizeScopeId(requestContext.scopeId)
    const scopeResolution = normalizeScopeResolution(requestContext.scopeResolution)

    if (explicitScopeId) {
      return {
        projectId: toNonEmptyString(requestContext.projectId),
        scopeId: explicitScopeId,
        scopeResolution,
      }
    }

    const projectContext = await resolveProjectContext(requestContext.projectId)
    if (projectContext.scopeId) {
      return {
        projectId: projectContext.projectId,
        scopeId: projectContext.scopeId,
        scopeResolution,
      }
    }

    const defaultProjectId = toNonEmptyString(options.defaultProjectId)
    const defaultScopeId = normalizeScopeId(options.defaultScopeId)

    return {
      projectId: defaultProjectId ?? projectContext.projectId,
      scopeId: defaultScopeId ?? defaultProjectId ?? projectContext.scopeId,
      scopeResolution,
    }
  }

  function clearCaches() {
    projectCache.clear()
  }

  return {
    resolveProjectContext,
    resolveRequestScope,
    clearCaches,
  }
}

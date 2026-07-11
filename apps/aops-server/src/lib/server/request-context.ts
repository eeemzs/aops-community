import type { RequestEvent } from '@sveltejs/kit'
import type { HostRequestContext } from '@aopslab/host-core'

import { readRequestContext } from '@/kits'
import { resolveProjectScopeFromLocals } from '$lib/server/api/project-scope'
import { normalizeNonEmptyProjectText } from '$lib/server/project-alias'

type RequestContextEvent = Pick<RequestEvent, 'locals' | 'request'>
type ScopeResolution = 'explicit' | 'cascade'
type RequestedScopeContext = {
  projectId?: string
  projectName?: string
  explicitScopeId?: string
  scopeResolution?: ScopeResolution
}

function getHeaderValue(event: RequestContextEvent, name: string): string | undefined {
  return normalizeNonEmptyProjectText(event.request.headers.get(name))
}

function getRequestedProjectId(event: RequestContextEvent): string | undefined {
  return normalizeNonEmptyProjectText(event.request.headers.get('x-project-id'))
}

function getRequestedProjectName(event: RequestContextEvent): string | undefined {
  return normalizeNonEmptyProjectText(event.request.headers.get('x-project-name'))
}

function getRequestedScopeId(event: RequestContextEvent): string | undefined {
  return getHeaderValue(event, 'x-scope-id')
}

function getRequestedScopeResolution(event: RequestContextEvent): ScopeResolution | undefined {
  const value = normalizeNonEmptyProjectText(event.request.headers.get('x-scope-resolution'))
  return value === 'explicit' || value === 'cascade' ? value : undefined
}

function getLocalsProjectId(event: RequestContextEvent): string | undefined {
  return normalizeNonEmptyProjectText((event.locals as { projectId?: string }).projectId)
}

function getLocalsScopeId(event: RequestContextEvent): string | undefined {
  return normalizeNonEmptyProjectText((event.locals as { scopeId?: string }).scopeId)
}

function getLocalsScopeResolution(event: RequestContextEvent): ScopeResolution | undefined {
  const value = (event.locals as { scopeResolution?: ScopeResolution }).scopeResolution
  return value === 'explicit' || value === 'cascade' ? value : undefined
}

function readRequestedScopeContext(event: RequestContextEvent): RequestedScopeContext {
  return {
    projectId: getLocalsProjectId(event) ?? getRequestedProjectId(event),
    projectName: getRequestedProjectName(event),
    explicitScopeId: getLocalsScopeId(event) ?? getRequestedScopeId(event),
    scopeResolution: getLocalsScopeResolution(event) ?? getRequestedScopeResolution(event),
  }
}

function writeLocalsScopeContext(
  event: RequestContextEvent,
  next: Partial<RequestedScopeContext>,
): void {
  if (next.projectId) {
    ;(event.locals as { projectId?: string }).projectId = next.projectId
  }
  if (next.explicitScopeId) {
    ;(event.locals as { scopeId?: string }).scopeId = next.explicitScopeId
  }
  if (next.scopeResolution) {
    ;(event.locals as { scopeResolution?: ScopeResolution }).scopeResolution = next.scopeResolution
  }
}

function resolveHostPrincipal(principal: App.Locals['principal']): HostRequestContext['principal'] {
  if (!principal) return null
  const principalRecord = principal as App.Locals['principal'] & { id?: string }
  const id = normalizeNonEmptyProjectText(principalRecord.id) ?? normalizeNonEmptyProjectText(principal.userId)
  return {
    ...principal,
    ...(id ? { id } : {}),
  }
}

export function resolveHostRequestContext(event: RequestContextEvent): HostRequestContext {
  const defaults = readRequestContext()
  const requested = readRequestedScopeContext(event)
  const projectId =
    normalizeNonEmptyProjectText((event.locals as { projectId?: string }).projectId) ?? requested.projectId
  return {
    tenantId:
      normalizeNonEmptyProjectText(event.locals.tenantId) ??
      getHeaderValue(event, 'x-tenant-id') ??
      defaults.tenantId,
    locale:
      normalizeNonEmptyProjectText(event.locals.locale) ??
      getHeaderValue(event, 'x-locale') ??
      defaults.locale,
    scopeId: requested.explicitScopeId,
    scopeResolution: requested.scopeResolution,
    fallbackLocale:
      normalizeNonEmptyProjectText(event.locals.fallbackLocale) ??
      getHeaderValue(event, 'x-fallback-locale') ??
      defaults.fallbackLocale,
    projectId,
    principal: resolveHostPrincipal(event.locals.principal),
  }
}

export async function attachResolvedProjectScope(event: RequestContextEvent): Promise<void> {
  const requested = readRequestedScopeContext(event)
  if (getLocalsProjectId(event) && requested.explicitScopeId) {
    return
  }

  const scopeLocals = {
    principal: event.locals.principal,
    tenantId: normalizeNonEmptyProjectText(event.locals.tenantId),
    locale: normalizeNonEmptyProjectText(event.locals.locale),
    fallbackLocale: normalizeNonEmptyProjectText(event.locals.fallbackLocale),
  }
  writeLocalsScopeContext(event, { scopeResolution: requested.scopeResolution })

  if (requested.projectId) {
    // authv2 PoC S1: resolve the explicit project id through the visibility-checked
    // resolver instead of a raw getById, so an unauthorized caller who knows a
    // project UUID cannot have its scope attached. Falls through on failure.
    const resolved = await resolveProjectScopeFromLocals({
      input: { projectId: requested.projectId },
      locals: scopeLocals,
    })
    if (resolved.ok) {
      writeLocalsScopeContext(event, { projectId: resolved.projectId })
      if (resolved.scopeId) {
        writeLocalsScopeContext(event, { explicitScopeId: resolved.scopeId })
      }
      return
    }
  }

  if (requested.projectName) {
    const resolved = await resolveProjectScopeFromLocals({
      input: { projectName: requested.projectName },
      locals: scopeLocals,
    })
    if (resolved.ok) {
      writeLocalsScopeContext(event, { projectId: resolved.projectId })
      if (resolved.scopeId) {
        writeLocalsScopeContext(event, { explicitScopeId: resolved.scopeId })
      }
    }
  }
}

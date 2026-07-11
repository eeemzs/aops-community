import { getAgentspaceKit, readRequestContext } from '@/kits'
import { errResult, type XfResult } from '$lib/server/xf-result'
import { safeFind, safeFindOne } from '$lib/server/repository'
import {
  normalizeNonEmptyProjectText,
  resolveProjectAliasValue,
} from '$lib/server/project-alias'

type Principal = {
  userId: string
  fullName?: string
  email?: string
  roles?: string[]
}

type ProjectInput = {
  projectId?: unknown
  projectName?: unknown
  project?: unknown
}

type ProjectRow = {
  id?: string
  name?: string
  slug?: string
  scopeId?: string
  ownerId?: string
  [key: string]: unknown
}

const PROJECT_REQUIRED_ERROR = 'project_required'

function normalizeNonEmpty(value: unknown): string | undefined {
  return normalizeNonEmptyProjectText(value)
}

function normalizeProjectLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function looksLikeProjectId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function projectRequiredResult(opts?: Record<string, unknown>): XfResult<unknown> {
  return errResult(PROJECT_REQUIRED_ERROR, {
    action: 'create_project',
    page: 'projects',
    ...opts,
  })
}

function normalizeProjectRecord(project: ProjectRow | null | undefined): ProjectRow | null {
  const id = normalizeNonEmpty(project?.id)
  if (!id) return null
  return {
    ...project,
    id,
    scopeId: id,
  }
}

function hasProjectService(kit: Awaited<ReturnType<typeof getAgentspaceKit>>): kit is Awaited<
  ReturnType<typeof getAgentspaceKit>
> & {
  createProjectService: () => Promise<{
    getById: (id: string) => unknown
    listProjects: (filter?: unknown, options?: unknown) => unknown
  }>
} {
  return typeof (kit as { createProjectService?: unknown }).createProjectService === 'function'
}

/**
 * Projects the principal may see: a global admin sees all; otherwise only owned
 * projects plus project_members rows. authv2 PoC S3 follow-up (issue 30bf1c34):
 * exported so the dedicated GET /api/agentspace/projects route can return a
 * principal-scoped list instead of the unscoped agentspace plugin listing.
 */
export async function listVisibleProjects(params: {
  kit: Awaited<ReturnType<typeof getAgentspaceKit>>
  principal: Principal
}): Promise<ProjectRow[]> {
  if (!hasProjectService(params.kit)) return []
  const projectSvc = await params.kit.createProjectService()
  const isAdmin = params.principal.roles?.includes('admin')
  if (isAdmin) {
    return (await safeFind(projectSvc.listProjects({}, { limit: 500 }))) as ProjectRow[]
  }

  const userId = normalizeNonEmpty(params.principal.userId)
  if (!userId) return []

  const owned = (await safeFind(projectSvc.listProjects({ ownerId: userId }, { limit: 500 }))) as ProjectRow[]
  const byId = new Map<string, ProjectRow>()

  for (const entry of owned) {
    const normalized = normalizeProjectRecord(entry)
    if (normalized?.id) {
      byId.set(normalized.id, normalized)
    }
  }

  try {
    const memberSvc = await params.kit.createProjectMemberService()
    const memberships = await safeFind(memberSvc.listProjectMembers({ userId }, { limit: 500 }))
    for (const membership of memberships as Array<{ projectId?: string }>) {
      const projectId = normalizeNonEmpty(membership?.projectId)
      if (!projectId || byId.has(projectId)) continue
      const project = normalizeProjectRecord(
        (await safeFindOne(projectSvc.getById(projectId))) as ProjectRow | null,
      )
      if (project?.id) {
        byId.set(project.id, project)
      }
    }
  } catch {
    // Project membership support is optional during the workspace removal migration.
  }

  return Array.from(byId.values())
}

/**
 * authv2 PoC S1 — close the explicit project-id visibility bypass: a project
 * fetched directly by id (uuid fast path) must only resolve when the principal
 * is a global admin, the project owner, or a project member. Without this, any
 * caller who knows a project UUID could attach its scope.
 */
async function principalCanAccessProject(params: {
  kit: Awaited<ReturnType<typeof getAgentspaceKit>>
  principal: Principal
  project: ProjectRow
}): Promise<boolean> {
  if (params.principal.roles?.includes('admin')) return true
  const userId = normalizeNonEmpty(params.principal.userId)
  if (!userId) return false
  if (normalizeNonEmpty(params.project.ownerId) === userId) return true
  const projectId = normalizeNonEmpty(params.project.id)
  if (!projectId) return false
  try {
    const memberSvc = await params.kit.createProjectMemberService()
    const memberships = await safeFind(
      memberSvc.listProjectMembers({ projectId, userId }, { limit: 1 }),
    )
    return Array.isArray(memberships) && memberships.length > 0
  } catch {
    // Membership support is optional during the workspace removal migration.
    return false
  }
}

async function resolveProjectIdFromValue(params: {
  kit: Awaited<ReturnType<typeof getAgentspaceKit>>
  principal: Principal
  value: string
}): Promise<{ ok: true; project: ProjectRow } | { ok: false; result: XfResult<unknown> }> {
  const explicit = normalizeNonEmpty(params.value)
  if (!explicit) {
    return { ok: false, result: projectRequiredResult({ source: 'resolveProjectIdFromValue' }) }
  }

  const visible = await listVisibleProjects({ kit: params.kit, principal: params.principal })
  const normalizedExplicit = normalizeProjectLabel(explicit)
  const matches = visible.filter((project) => {
    const id = normalizeProjectLabel(project.id)
    const name = normalizeProjectLabel(project.name)
    const slug = normalizeProjectLabel(project.slug)
    return id === normalizedExplicit || name === normalizedExplicit || slug === normalizedExplicit
  })

  if (matches.length === 1) {
    return { ok: true, project: matches[0] }
  }

  if (matches.length > 1) {
    return {
      ok: false,
      result: errResult('project_name_ambiguous', {
        requested: explicit,
        candidates: matches.slice(0, 25).map((project) => ({
          id: project.id,
          name: project.name,
          slug: project.slug,
        })),
      }),
    }
  }

  if (hasProjectService(params.kit) && looksLikeProjectId(explicit)) {
    const projectSvc = await params.kit.createProjectService()
    const direct = normalizeProjectRecord(
      (await safeFindOne(projectSvc.getById(explicit))) as ProjectRow | null,
    )
    if (
      direct?.id &&
      (await principalCanAccessProject({ kit: params.kit, principal: params.principal, project: direct }))
    ) {
      return { ok: true, project: direct }
    }
  }

  return { ok: false, result: errResult('project_not_found', { requested: explicit }) }
}

async function resolveProjectId(params: {
  input: ProjectInput
  kit: Awaited<ReturnType<typeof getAgentspaceKit>>
  principal: Principal
}): Promise<{ ok: true; project: ProjectRow } | { ok: false; result: XfResult<unknown> }> {
  const explicit = normalizeNonEmpty(resolveProjectAliasValue(params.input))
  if (explicit) {
    return resolveProjectIdFromValue({ kit: params.kit, principal: params.principal, value: explicit })
  }

  const visible = await listVisibleProjects({ kit: params.kit, principal: params.principal })
  const normalized = visible
    .map((project) => normalizeProjectRecord(project))
    .filter((project): project is ProjectRow => Boolean(project?.id))

  if (normalized.length === 0) {
    return { ok: false, result: projectRequiredResult({ source: 'resolveProjectId' }) }
  }

  const namedDemo =
    normalized.find((project) => normalizeProjectLabel(project.name) === 'demo-project') ?? normalized[0]
  return { ok: true, project: namedDemo }
}

function toProjectInput(input: ProjectInput): ProjectInput {
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    project: input.project,
  }
}

export async function resolveProjectScopeFromLocals(params: {
  input?: ProjectInput
  locals: {
    principal?: Principal | null
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }
}): Promise<
  | {
      ok: true
      ctx: ReturnType<typeof readRequestContext> & { database: string; actorId?: string }
      kit: Awaited<ReturnType<typeof getAgentspaceKit>>
      principal: Principal
      projectId: string
      scopeId: string
    }
  | { ok: false; result: XfResult<unknown> }
> {
  const principal = params.locals.principal ?? undefined
  if (!principal?.userId) return { ok: false, result: errResult('unauthorized') }

  const ctxBase = readRequestContext({
    tenantId: params.locals.tenantId,
    locale: params.locals.locale,
    fallbackLocale: params.locals.fallbackLocale,
  })
  const ctx = {
    ...ctxBase,
    database: 'default',
    actorId: principal.userId,
  }

  const kit = await getAgentspaceKit()
  const projectResolution = await resolveProjectId({
    input: toProjectInput(params.input ?? {}),
    kit,
    principal,
  })
  if (!projectResolution.ok) return { ok: false, result: projectResolution.result }

  const project = normalizeProjectRecord(projectResolution.project)
  if (!project?.id) {
    return { ok: false, result: errResult('project_scope_not_found', { projectId: project?.id }) }
  }

  return {
    ok: true,
    ctx,
    kit,
    principal,
    projectId: project.id,
    scopeId: project.id,
  }
}

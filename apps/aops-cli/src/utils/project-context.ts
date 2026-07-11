import {
  normalizeNonEmpty,
  type CommonOptions,
} from './command.js'
import {
  loadAopsRepoConfig,
  type AopsRepoProjectConfig,
} from './repo-config.js'

export type ProjectBindingContextOptions = CommonOptions & {
  scopeId?: string
  projectId?: string
  projectName?: string
  projectSlug?: string
}

export type PendingServerProjectLookup = {
  kind: 'slug' | 'name'
  value: string
}

export type ResolvedProjectBindingContext = {
  repoRoot: string
  configPath: string
  scopeId?: string
  projectId?: string
  projectName?: string
  projectSlug?: string
  localRoot?: string
  ownerRepo?: string
  parentProjectSlug?: string
  configFound: boolean
  /**
   * Set when `--project-slug`/`--project-name` was provided but the optional repo
   * config did not resolve it to a project id. The pure base resolver makes no
   * server call; callers with an `apiState`/invoke capability resolve this against
   * the hosted Agentspace project list via {@link hydrateProjectIdFromServerLookup}.
   */
  pendingServerProjectLookup?: PendingServerProjectLookup
}

export type ResolvedScopeBindingContext = ResolvedProjectBindingContext

function normalizeProjectName(value: unknown): string | undefined {
  return normalizeNonEmpty(value)?.toLowerCase()
}

function normalizeProjectSlug(value: unknown): string | undefined {
  return normalizeNonEmpty(value)?.toLowerCase()
}

function matchProjectByName(project: AopsRepoProjectConfig, projectName: string): boolean {
  return normalizeProjectName(project.name) === normalizeProjectName(projectName)
}

function matchProjectBySlug(project: AopsRepoProjectConfig, projectSlug: string): boolean {
  return normalizeProjectSlug(project.slug) === normalizeProjectSlug(projectSlug)
}

function resolveProjectFromConfig(
  projects: AopsRepoProjectConfig[],
  options: {
    scopeId?: string
    projectId?: string
    projectName?: string
    projectSlug?: string
    activeProjectName?: string
  },
): AopsRepoProjectConfig | null {
  const explicitProjectName = normalizeNonEmpty(options.projectName)
  if (explicitProjectName) {
    const matches = projects.filter((project) => matchProjectByName(project, explicitProjectName))
    if (matches.length === 0) {
      const available = projects.map((project) => project.name).join(', ')
      throw new Error(
        `Project "${explicitProjectName}" was not found in repo config. Available projects: ${available || '(none)'}.`,
      )
    }
    if (matches.length > 1) {
      const ids = matches
        .map((project) => `${project.name} (${project.scopeId ?? project.projectId})`)
        .join(', ')
      throw new Error(`Project name "${explicitProjectName}" is ambiguous in repo config: ${ids}.`)
    }
    return matches[0]
  }

  const explicitProjectSlug = normalizeNonEmpty(options.projectSlug)
  if (explicitProjectSlug) {
    const matches = projects.filter((project) => matchProjectBySlug(project, explicitProjectSlug))
    if (matches.length === 0) {
      const available = projects
        .map((project) => normalizeNonEmpty(project.slug))
        .filter((entry): entry is string => Boolean(entry))
        .join(', ')
      throw new Error(
        `Project slug "${explicitProjectSlug}" was not found in repo config. Available slugs: ${available || '(none)'}.`,
      )
    }
    if (matches.length > 1) {
      const ids = matches
        .map((project) => `${project.slug ?? project.name} (${project.scopeId ?? project.projectId})`)
        .join(', ')
      throw new Error(`Project slug "${explicitProjectSlug}" is ambiguous in repo config: ${ids}.`)
    }
    return matches[0]
  }

  const explicitScopeId = normalizeNonEmpty(options.scopeId)
  if (explicitScopeId) {
    return (
      projects.find((project) => project.scopeId === explicitScopeId) ??
      projects.find((project) => project.projectId === explicitScopeId) ??
      null
    )
  }

  const explicitProjectId = normalizeNonEmpty(options.projectId)
  if (explicitProjectId) {
    return (
      projects.find((project) => project.projectId === explicitProjectId) ??
      projects.find((project) => project.scopeId === explicitProjectId) ??
      null
    )
  }

  const activeProjectName = normalizeNonEmpty(options.activeProjectName)
  if (activeProjectName) {
    const active = projects.find((project) => matchProjectByName(project, activeProjectName))
    if (active) return active
  }

  return projects[0] ?? null
}

export async function resolveProjectBindingContext(
  options: ProjectBindingContextOptions,
  params: { requireProject?: boolean } = {},
): Promise<ResolvedProjectBindingContext> {
  const requireProject = params.requireProject === true
  // Server-first: repo-local `.aops` config is an OPTIONAL cache hint. Its absence
  // is never an error — `--project-id` resolves with no repo present at all.
  const { rootDir, configPath, config } = await loadAopsRepoConfig(process.cwd())
  const explicitScopeId = normalizeNonEmpty(options.scopeId)
  const explicitProjectId = normalizeNonEmpty(options.projectId)
  const explicitProjectName = normalizeNonEmpty(options.projectName)
  const explicitProjectSlug = normalizeNonEmpty(options.projectSlug)

  // Fast local path: an explicit `--project-id` (or legacy `--scope-id` alias) binds
  // scope=project=that id with NO repo config and NO server call. Config, when present,
  // is consulted only to enrich name/slug/localRoot; its absence is not an error.
  const explicitId = explicitProjectId ?? explicitScopeId

  const configProject = config
    ? resolveProjectFromConfig(config.projects, {
        scopeId: explicitScopeId,
        projectId: explicitProjectId,
        projectName: explicitProjectName,
        projectSlug: explicitProjectSlug,
        activeProjectName: config.activeProjectName,
      })
    : null

  const projectId =
    explicitProjectId ??
    explicitScopeId ??
    configProject?.projectId ??
    configProject?.scopeId
  const scopeId = projectId
  const projectName = explicitProjectName ?? configProject?.name
  const projectSlug = explicitProjectSlug ?? normalizeNonEmpty(configProject?.slug)

  // Server-first slug/name resolution: when slug/name was supplied but neither an
  // explicit id nor the optional config cache resolved a project id, mark a pending
  // lookup. The pure base resolver never reaches the network; a caller that holds an
  // invoke capability resolves it via {@link hydrateProjectIdFromServerLookup}.
  const pendingServerProjectLookup: PendingServerProjectLookup | undefined =
    !projectId && !explicitId
      ? explicitProjectSlug
        ? { kind: 'slug', value: explicitProjectSlug }
        : explicitProjectName
          ? { kind: 'name', value: explicitProjectName }
          : undefined
      : undefined

  // A pending server lookup still counts as "resolvable" — defer the hard failure to
  // the caller's hydrate step so `requireProject` does not reject a valid --project-slug.
  if (requireProject && !scopeId && !projectId && !pendingServerProjectLookup) {
    throw new Error(
      'Project context could not be resolved. Provide --project-id <id>, or --project-slug/--project-name (resolved against the server). `--scope-id` remains a legacy/internal alias.',
    )
  }

  return {
    repoRoot: rootDir,
    configPath,
    scopeId: scopeId ?? projectId,
    projectId,
    projectName,
    projectSlug,
    localRoot: normalizeNonEmpty(configProject?.localRoot),
    ownerRepo: normalizeNonEmpty(configProject?.ownerRepo),
    parentProjectSlug: normalizeNonEmpty(configProject?.parentProjectSlug),
    configFound: Boolean(config),
    ...(pendingServerProjectLookup ? { pendingServerProjectLookup } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Peel the hosted-op envelope down to the underlying entity record.
 *
 * `agentspace.project.get-by-id` returns `{ ok, tool, data: { ok, data: <record> } }`
 * (and the CLI invoke layer additionally wraps it as `{ ok, response: <envelope> }`).
 * We unwrap `response`, then descend through nested `data` wrappers until we reach a
 * record that carries an `id`/`projectId`, which is the project record itself.
 */
function unwrapHostedEntityRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  let current: unknown = payload
  if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, 'response')) {
    current = current.response
  }
  for (let depth = 0; depth < 6 && isRecord(current); depth += 1) {
    const record = current
    if (
      normalizeNonEmpty(record.id) ??
      normalizeNonEmpty(record.projectId) ??
      normalizeNonEmpty(record.slug)
    ) {
      return record
    }
    if (Object.prototype.hasOwnProperty.call(record, 'data')) {
      current = record.data
      continue
    }
    return record
  }
  return isRecord(current) ? current : null
}

/**
 * Peel the hosted-op envelope down to the underlying list of rows.
 *
 * `agentspace.project.list-projects` returns `{ ok, tool, data: { ok, data: <rows> } }`
 * (plus the CLI invoke layer's `{ ok, response: <envelope> }` wrapper). Rows may be a
 * bare array or `{ items: [...] }`. We unwrap `response`, then descend through nested
 * `data` wrappers until we reach an array (or an `items` array).
 */
function unwrapHostedEntityRows(payload: Record<string, unknown>): Record<string, unknown>[] {
  let current: unknown = payload
  if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, 'response')) {
    current = current.response
  }
  for (let depth = 0; depth < 6; depth += 1) {
    if (Array.isArray(current)) break
    if (isRecord(current) && Array.isArray(current.items)) {
      current = current.items
      break
    }
    if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data
      continue
    }
    break
  }
  if (!Array.isArray(current)) return []
  return current.filter((entry): entry is Record<string, unknown> => isRecord(entry))
}

export type HydrateProjectContextDeps = {
  invokeHostedTool: (input: {
    toolId: string
    input: unknown
  }) => Promise<Record<string, unknown>>
}

/**
 * Opt-in server verification: given a context already bound to a `projectId` (e.g. via
 * the fast `--project-id` local path or a config cache hint), confirm the project exists
 * server-side and enrich the context with the server's canonical name/slug.
 *
 * This embodies the server-first "config = cache, verify against server" principle. It is
 * intentionally NOT folded into the synchronous-capable {@link resolveProjectBindingContext}
 * so `--project-id` stays a fast local path with no forced network round-trip.
 *
 * `apiState` is passed structurally (only the hosted-invoke capability is required) so this
 * helper has no import cycle with the agent gateway; callers pass a thin adapter over
 * `invokeHostedToolWithApiState`.
 */
export async function hydrateProjectContextFromServer(
  context: ResolvedProjectBindingContext,
  deps: HydrateProjectContextDeps,
): Promise<ResolvedProjectBindingContext> {
  const projectId = normalizeNonEmpty(context.projectId) ?? normalizeNonEmpty(context.scopeId)
  if (!projectId) {
    throw new Error(
      'Cannot verify project against server without a resolved project id. Provide --project-id <id>.',
    )
  }

  const payload = await deps.invokeHostedTool({
    toolId: 'agentspace.project.get-by-id',
    input: { id: projectId },
  })
  const project = unwrapHostedEntityRecord(payload)
  if (!project) {
    throw new Error(`Project ${projectId} not found on server.`)
  }

  const scopeId =
    normalizeNonEmpty(project.scopeId) ??
    normalizeNonEmpty(project.id) ??
    normalizeNonEmpty(project.projectId) ??
    context.scopeId ??
    projectId

  return {
    ...context,
    scopeId,
    projectId: normalizeNonEmpty(project.id) ?? normalizeNonEmpty(project.projectId) ?? projectId,
    projectName: normalizeNonEmpty(project.name) ?? context.projectName,
    projectSlug: normalizeNonEmpty(project.slug) ?? context.projectSlug,
  }
}

export type ResolvedServerProjectId = {
  projectId: string
  scopeId: string
  name?: string
  slug?: string
}

function normalizeLookupKey(value: unknown): string | undefined {
  return normalizeNonEmpty(value)?.toLowerCase()
}

/**
 * Resolve a `--project-slug`/`--project-name` value to a project id against the hosted
 * Agentspace project list.
 *
 * The hosted `agentspace.project.list-projects` filter is an exact DB equality match
 * (`matchEq`), so an uppercase/mixed-case name would NOT match a lowercased stored value
 * server-side. We therefore fetch the tenant-scoped project list with NO filter and match
 * CLIENT-SIDE after lowercasing + trimming both the input and each row's slug/name.
 *
 * `deps.invokeHostedTool` is passed structurally (only the hosted-invoke capability is
 * required) so this helper has no import cycle with the agent gateway; callers pass a thin
 * adapter over `invokeHostedToolWithApiState`. The adapter MUST NOT carry any project
 * binding (no `--project-slug`/`--project-name`/`--project-id`/scope) so the list is a clean
 * tenant-scoped read and there is no re-entrant resolution.
 *
 * Semantics: exactly one normalized match -> resolved id; zero matches -> clean not-found;
 * more than one match -> ambiguous error listing each candidate `name (id)`.
 */
export async function resolveProjectIdFromServer(
  value: string,
  kind: 'slug' | 'name',
  deps: HydrateProjectContextDeps,
): Promise<ResolvedServerProjectId> {
  const normalizedValue = normalizeLookupKey(value)
  if (!normalizedValue) {
    throw new Error(`Project ${kind} is required to resolve a project id from the server.`)
  }

  const payload = await deps.invokeHostedTool({
    toolId: 'agentspace.project.list-projects',
    // No filter: exact server-side matchEq cannot honor case normalization, so we fetch the
    // full tenant-scoped list and match client-side.
    input: {},
  })
  const rows = unwrapHostedEntityRows(payload)

  const matches = rows.filter((row) => normalizeLookupKey(kind === 'slug' ? row.slug : row.name) === normalizedValue)

  if (matches.length === 0) {
    throw new Error(`Project ${kind} '${value}' not found on the server.`)
  }
  if (matches.length > 1) {
    const candidates = matches
      .map((row) => {
        const id = normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.projectId) ?? '(no id)'
        const label = normalizeNonEmpty(row.name) ?? normalizeNonEmpty(row.slug) ?? '(unnamed)'
        return `${label} (${id})`
      })
      .join(', ')
    throw new Error(`Project ${kind} '${value}' is ambiguous on the server. Candidates: ${candidates}.`)
  }

  const project = matches[0]!
  const projectId = normalizeNonEmpty(project.id) ?? normalizeNonEmpty(project.projectId)
  if (!projectId) {
    throw new Error(`Project ${kind} '${value}' resolved a record without an id on the server.`)
  }
  const scopeId = normalizeNonEmpty(project.scopeId) ?? projectId

  return {
    projectId,
    scopeId,
    name: normalizeNonEmpty(project.name),
    slug: normalizeNonEmpty(project.slug),
  }
}

/**
 * If the resolved context carries a {@link PendingServerProjectLookup} (slug/name supplied
 * but neither an explicit id nor the config cache resolved a project id), resolve it against
 * the hosted project list and fill in id/scope/name/slug. Otherwise the context is returned
 * unchanged — so the `--project-id` fast path never triggers a server call here.
 */
export async function hydrateProjectIdFromServerLookup(
  context: ResolvedProjectBindingContext,
  deps: HydrateProjectContextDeps,
): Promise<ResolvedProjectBindingContext> {
  const pending = context.pendingServerProjectLookup
  if (!pending || normalizeNonEmpty(context.projectId)) {
    return context
  }

  const resolved = await resolveProjectIdFromServer(pending.value, pending.kind, deps)
  const { pendingServerProjectLookup: _consumed, ...rest } = context
  return {
    ...rest,
    projectId: resolved.projectId,
    scopeId: resolved.scopeId,
    projectName: resolved.name ?? context.projectName,
    projectSlug: resolved.slug ?? context.projectSlug,
  }
}

export function preferProjectNameBinding(
  context: Pick<ResolvedScopeBindingContext, 'projectName'>,
): { projectName?: string } {
  const projectName = normalizeNonEmpty(context.projectName)
  return projectName ? { projectName } : {}
}

export function resolveOwnerScopeIdFromBinding(
  context: Pick<ResolvedScopeBindingContext, 'scopeId' | 'projectId'>,
): string | undefined {
  return normalizeNonEmpty(context.scopeId) ?? normalizeNonEmpty(context.projectId)
}

export function resolveOwnerScopeIdFromProjectRecord(
  project: Record<string, unknown> | null | undefined,
  fallback?: unknown,
): string | undefined {
  return (
    normalizeNonEmpty(project?.scopeId) ??
    normalizeNonEmpty(fallback) ??
    normalizeNonEmpty(project?.id) ??
    normalizeNonEmpty(project?.projectId)
  )
}

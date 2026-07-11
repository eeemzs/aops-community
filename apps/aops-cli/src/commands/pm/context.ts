import {
  resolveProjectBindingContext,
  type ProjectBindingContextOptions,
  type ResolvedProjectBindingContext,
} from '../../utils/project-context.js'

export type PmContextOptions = ProjectBindingContextOptions

// Server-first: Projectman is HOSTED-ONLY. The repo-first PM write transport and the
// transitional config-derived `authoringMode` split (S2a shim) are gone. The PM context is
// exactly the shared server-first project binding (scope = project id resolved by
// {@link resolveProjectBindingContext}); there is no local authoring mode to re-derive.
export type ResolvedPmContext = ResolvedProjectBindingContext

export async function resolvePmContext(
  options: PmContextOptions,
  params: { requireProject?: boolean } = {},
): Promise<ResolvedPmContext> {
  return resolveProjectBindingContext(options, {
    requireProject: params.requireProject !== false,
  })
}

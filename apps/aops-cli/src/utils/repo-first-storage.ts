import path from 'node:path'

import { normalizeNonEmpty } from './command.js'

export type RepoFirstStorageContext = string | {
  repoRoot: string
  localRoot?: string
}

export function resolveRepoFirstWorkspaceRoot(context: RepoFirstStorageContext): string {
  const repoRoot = typeof context === 'string' ? context : context.repoRoot
  const localRoot = typeof context === 'string' ? undefined : normalizeNonEmpty(context.localRoot)
  if (!localRoot) return path.join(repoRoot, '.aops')
  return path.isAbsolute(localRoot) ? localRoot : path.join(repoRoot, localRoot)
}

export function resolveRepoFirstWorkspaceRelativeRoot(context: RepoFirstStorageContext): string {
  const repoRoot = typeof context === 'string' ? context : context.repoRoot
  return path.relative(repoRoot, resolveRepoFirstWorkspaceRoot(context)).split(path.sep).join('/') || '.'
}

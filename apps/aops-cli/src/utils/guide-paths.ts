import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT_URL = new URL('../../', import.meta.url)

export type GuideKey = 'operator' | 'agentspace' | 'projectman' | 'docman' | 'fileman' | 'tasker' | 'agentAssets'

type GuideTarget = {
  fallbackPath?: string
  mirrorPath: string
}

export type GuideResolution = {
  key: GuideKey
  path: string
  source: 'docman-mirror' | 'docman-mirror-missing' | 'package-fallback'
  mirrorPath: string
  fallbackPath?: string
}

const GUIDE_TARGETS: Record<GuideKey, GuideTarget> = {
  operator: {
    mirrorPath: path.join('.aops', 'docman', 'aops-guides', 'aops-cli-user-guide.md'),
  },
  agentspace: {
    mirrorPath: path.join('.aops', 'docman', 'domain-guides', 'agentspace-user-guide.md'),
  },
  projectman: {
    fallbackPath: '../../../../domains/projectman/USER_GUIDE.md',
    mirrorPath: path.join('.aops', 'docman', 'domain-guides', 'projectman-user-guide.md'),
  },
  docman: {
    fallbackPath: '../../../../domains/docman/USER_GUIDE.md',
    mirrorPath: path.join('.aops', 'docman', 'domain-guides', 'docman-user-guide.md'),
  },
  fileman: {
    fallbackPath: '../../../../domains/fileman/USER_GUIDE.md',
    mirrorPath: path.join('.aops', 'docman', 'domain-guides', 'fileman-user-guide.md'),
  },
  tasker: {
    fallbackPath: '../../../../domains/tasker/USER_GUIDE.md',
    mirrorPath: path.join('.aops', 'docman', 'domain-guides', 'tasker-user-guide.md'),
  },
  agentAssets: {
    fallbackPath: './docs/agent-assets-bootstrap.md',
    mirrorPath: path.join('.aops', 'docman', 'aops-guides', 'aops-agent-assets-bootstrap.md'),
  },
}

function resolvePackagePath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, PACKAGE_ROOT_URL))
}

function findAopsRepoRoot(startDir: string): string | undefined {
  let current = path.resolve(startDir)
  while (true) {
    if (existsSync(path.join(current, '.aops'))) return current
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

export function resolveGuideDetails(key: GuideKey, cwd = process.cwd()): GuideResolution {
  const target = GUIDE_TARGETS[key]
  const fallbackPath = target.fallbackPath ? resolvePackagePath(target.fallbackPath) : undefined
  const repoRoot = findAopsRepoRoot(cwd)
  const mirrorPath = repoRoot ? path.join(repoRoot, target.mirrorPath) : path.resolve(cwd, target.mirrorPath)
  if (repoRoot && existsSync(mirrorPath)) {
    return { key, path: mirrorPath, source: 'docman-mirror', mirrorPath, fallbackPath }
  }
  if (!fallbackPath) {
    return { key, path: mirrorPath, source: 'docman-mirror-missing', mirrorPath }
  }
  return { key, path: fallbackPath, source: 'package-fallback', mirrorPath, fallbackPath }
}

export function resolveAopsGuidePath(key: GuideKey, cwd = process.cwd()): string {
  return resolveGuideDetails(key, cwd).path
}

export const GUIDE_PATHS = {
  operator: resolveAopsGuidePath('operator'),
  agentspace: resolveAopsGuidePath('agentspace'),
  projectman: resolveAopsGuidePath('projectman'),
  docman: resolveAopsGuidePath('docman'),
  fileman: resolveAopsGuidePath('fileman'),
  tasker: resolveAopsGuidePath('tasker'),
  agentAssets: resolveAopsGuidePath('agentAssets'),
} as const

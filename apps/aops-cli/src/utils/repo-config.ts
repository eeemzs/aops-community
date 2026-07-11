import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'

import type {
  OperatorRepoConfig,
  OperatorRepoProjectConfig,
} from '@aopslab/xf-cli-operator'
import {
  buildOperatorRepoConfig,
  findWorkspaceRoot,
  normalizeOperatorRepoConfig,
  resolveRepoConfigPath,
} from '@aopslab/xf-cli-operator'

export type AopsProjectAuthoringMode = 'local' | 'hosted-only'

export type AopsRepoProjectConfig = OperatorRepoProjectConfig & {
  authoringMode?: AopsProjectAuthoringMode
  localRoot?: string
  ownerRepo?: string
  parentProjectSlug?: string
}

export type AopsRepoConfig = Omit<OperatorRepoConfig, 'projects'> & {
  projects: AopsRepoProjectConfig[]
}

export { resolveRepoConfigPath }

export function serializeAopsRepoConfig(config: AopsRepoConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

export function buildAopsRepoConfig(params: {
  repoName: string
  projectName: string
  projectId: string
  scopeId?: string
  projectSlug?: string
}): AopsRepoConfig {
  return buildOperatorRepoConfig(params)
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeProjectAuthoringMode(value: unknown): AopsProjectAuthoringMode | undefined {
  return value === 'local' || value === 'hosted-only' ? value : undefined
}

function rawProjectKey(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  return normalizeString(record.projectId) ?? normalizeString(record.slug) ?? normalizeString(record.name)
}

function mergeAopsProjectExtensions(
  normalized: OperatorRepoProjectConfig,
  rawProjects: unknown[],
): AopsRepoProjectConfig {
  const candidates = [
    normalized.projectId,
    normalized.slug,
    normalized.name,
  ].filter((entry): entry is string => Boolean(entry))
  const raw = rawProjects.find((entry) => {
    const key = rawProjectKey(entry)
    return key ? candidates.includes(key) : false
  })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalized

  const record = raw as Record<string, unknown>
  return {
    ...normalized,
    ...(normalizeProjectAuthoringMode(record.authoringMode) ? { authoringMode: normalizeProjectAuthoringMode(record.authoringMode) } : {}),
    ...(normalizeString(record.localRoot) ? { localRoot: normalizeString(record.localRoot) } : {}),
    ...(normalizeString(record.ownerRepo) ? { ownerRepo: normalizeString(record.ownerRepo) } : {}),
    ...(normalizeString(record.parentProjectSlug) ? { parentProjectSlug: normalizeString(record.parentProjectSlug) } : {}),
  }
}

export function normalizeAopsRepoConfig(raw: unknown): AopsRepoConfig | null {
  const normalized = normalizeOperatorRepoConfig(raw)
  if (!normalized) return null
  const rawProjects =
    raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as { projects?: unknown }).projects)
      ? (raw as { projects: unknown[] }).projects
      : []

  return {
    ...normalized,
    projects: normalized.projects.map((project) => mergeAopsProjectExtensions(project, rawProjects)),
  }
}

export async function readAopsRepoConfig(rootDir: string): Promise<AopsRepoConfig | null> {
  const configPath = resolveRepoConfigPath(rootDir)
  if (!existsSync(configPath)) return null
  try {
    const rawContent = await fs.readFile(configPath, 'utf8')
    const parsed = JSON.parse(rawContent)
    const normalized = normalizeAopsRepoConfig(parsed)
    if (!normalized) return null

    const serialized = serializeAopsRepoConfig(normalized)
    if (rawContent !== serialized) {
      await fs.writeFile(configPath, serialized, 'utf8')
    }
    return normalized
  } catch {
    return null
  }
}

export async function readAopsRepoConfigReadOnly(rootDir: string): Promise<AopsRepoConfig | null> {
  const configPath = resolveRepoConfigPath(rootDir)
  if (!existsSync(configPath)) return null
  try {
    const rawContent = await fs.readFile(configPath, 'utf8')
    const parsed = JSON.parse(rawContent)
    return normalizeAopsRepoConfig(parsed)
  } catch {
    return null
  }
}

export async function writeAopsRepoConfig(configPath: string, config: AopsRepoConfig): Promise<void> {
  await fs.writeFile(configPath, serializeAopsRepoConfig(config), 'utf8')
}

export async function loadAopsRepoConfig(startDir = process.cwd()): Promise<{
  rootDir: string
  configPath: string
  config: AopsRepoConfig | null
}> {
  const rootDir = findWorkspaceRoot(startDir)
  const configPath = resolveRepoConfigPath(rootDir)
  return {
    rootDir,
    configPath,
    config: await readAopsRepoConfig(rootDir),
  }
}

export async function loadAopsRepoConfigReadOnly(startDir = process.cwd()): Promise<{
  rootDir: string
  configPath: string
  config: AopsRepoConfig | null
}> {
  const rootDir = findWorkspaceRoot(startDir)
  const configPath = resolveRepoConfigPath(rootDir)
  return {
    rootDir,
    configPath,
    config: await readAopsRepoConfigReadOnly(rootDir),
  }
}

import fs from 'node:fs/promises'
import path from 'node:path'

import { normalizeNonEmpty } from './command.js'
import { parseFrontmatterDocument, renderFrontmatterDocument } from './memory-workspace.js'
import { writeFileWithRetry } from './transient-fs.js'

export type HostedMirrorKind = 'skill' | 'prompt'

export type HostedMirrorProject = {
  projectId?: string
  projectName?: string
  projectSlug?: string
  scopeId?: string
}

export type HostedMirrorItem = {
  kind: HostedMirrorKind
  remoteId: string
  name: string
  body: string
  frontmatter: Record<string, unknown>
}

type HostedMirrorRecord = {
  filePath: string
  frontmatter: Record<string, unknown>
  body: string
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item'
}

function relativePath(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/')
}

async function readMarkdownRecords(rootDir: string): Promise<HostedMirrorRecord[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const records: HostedMirrorRecord[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'index.md') continue
      const filePath = path.join(rootDir, entry.name)
      const parsed = parseFrontmatterDocument(await fs.readFile(filePath, 'utf8'))
      records.push({ filePath, frontmatter: parsed.frontmatter, body: parsed.body })
    }
    return records
  } catch {
    return []
  }
}

function titleFromProject(project: HostedMirrorProject, fallback = 'unknown-project'): string {
  return normalizeNonEmpty(project.projectName)
    ?? normalizeNonEmpty(project.projectSlug)
    ?? normalizeNonEmpty(project.projectId)
    ?? normalizeNonEmpty(project.scopeId)
    ?? fallback
}

function sourceKeyFromFrontmatter(frontmatter: Record<string, unknown>): string | undefined {
  const sourceSlug = normalizeNonEmpty(frontmatter.sourceProjectSlug)
  if (sourceSlug) return slugify(sourceSlug)
  const sourceName = normalizeNonEmpty(frontmatter.sourceProjectName)
  if (sourceName) return slugify(sourceName)
  return undefined
}

function buildHostedMirrorFileNames(items: HostedMirrorItem[]): Map<string, string> {
  const grouped = new Map<string, HostedMirrorItem[]>()
  for (const item of items) {
    const key = slugify(item.name)
    const bucket = grouped.get(key) ?? []
    bucket.push(item)
    grouped.set(key, bucket)
  }

  const occupied = new Set<string>()
  const fileNames = new Map<string, string>()
  for (const [baseName, bucket] of [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    const sorted = [...bucket].sort((left, right) => {
      const sourceCompare = (sourceKeyFromFrontmatter(left.frontmatter) ?? '').localeCompare(sourceKeyFromFrontmatter(right.frontmatter) ?? '')
      if (sourceCompare !== 0) return sourceCompare
      return left.remoteId.localeCompare(right.remoteId)
    })
    for (const item of sorted) {
      const sourceKey = sourceKeyFromFrontmatter(item.frontmatter)
      const candidates = [`${baseName}.md`]
      if (sourceKey && sourceKey !== baseName) candidates.push(`${baseName}--${sourceKey}.md`)
      let chosen = candidates.find((candidate) => !occupied.has(candidate))
      let nextCounter = 2
      while (!chosen) {
        const candidate = `${baseName}--${nextCounter}.md`
        if (!occupied.has(candidate)) chosen = candidate
        nextCounter += 1
      }
      occupied.add(chosen)
      fileNames.set(item.remoteId, chosen)
    }
  }
  return fileNames
}

export function hostedProjectKey(project: HostedMirrorProject): string {
  return slugify(
    normalizeNonEmpty(project.projectId)
      ?? normalizeNonEmpty(project.projectSlug)
      ?? normalizeNonEmpty(project.projectName)
      ?? normalizeNonEmpty(project.scopeId)
      ?? 'unknown-project',
  )
}

function hostedProjectKeyFromFrontmatter(frontmatter: Record<string, unknown>): string {
  return hostedProjectKey({
    projectId: normalizeNonEmpty(frontmatter.sourceProjectId),
    projectName: normalizeNonEmpty(frontmatter.sourceProjectName),
    projectSlug: normalizeNonEmpty(frontmatter.sourceProjectSlug),
    scopeId: normalizeNonEmpty(frontmatter.sourceScopeId),
  })
}

export function resolveHostedWorkspacePaths(repoRoot: string): {
  root: string
  skillsRoot: string
  promptsRoot: string
} {
  const root = path.join(repoRoot, '.aops', 'hosted')
  return {
    root,
    skillsRoot: path.join(root, 'skills'),
    promptsRoot: path.join(root, 'prompts'),
  }
}

export async function syncHostedMirrorKind(
  repoRoot: string,
  kind: HostedMirrorKind,
  items: HostedMirrorItem[],
  params: { touchedProjectKeys?: string[] } = {},
): Promise<string[]> {
  const paths = resolveHostedWorkspacePaths(repoRoot)
  const itemsDir = kind === 'skill' ? paths.skillsRoot : paths.promptsRoot
  const existing = await readMarkdownRecords(itemsDir)
  const existingByRemoteId = new Map<string, HostedMirrorRecord>()
  for (const record of existing) {
    const remoteId = normalizeNonEmpty(record.frontmatter.remoteId)
    if (remoteId) existingByRemoteId.set(remoteId, record)
  }
  const touchedProjects = new Set((params.touchedProjectKeys ?? []).map((entry) => slugify(entry)))
  const keepPaths = new Set<string>()
  const written: string[] = []
  const fileNames = buildHostedMirrorFileNames(items)

  await fs.mkdir(itemsDir, { recursive: true })
  for (const item of items) {
    const fileName = fileNames.get(item.remoteId) ?? `${slugify(item.name)}.md`
    const filePath = path.join(itemsDir, fileName)
    await writeFileWithRetry(filePath, renderFrontmatterDocument(item.frontmatter, item.body), 'utf8')
    keepPaths.add(filePath)
    written.push(relativePath(repoRoot, filePath))
  }

  for (const record of existing) {
    if (keepPaths.has(record.filePath)) continue
    if (touchedProjects.size > 0 && !touchedProjects.has(hostedProjectKeyFromFrontmatter(record.frontmatter))) continue
    await fs.rm(record.filePath, { force: true })
  }

  await fs.rm(path.join(itemsDir, 'items'), { recursive: true, force: true })

  return written
}

function sourceLabel(frontmatter: Record<string, unknown>): string {
  return titleFromProject({
    projectId: normalizeNonEmpty(frontmatter.sourceProjectId),
    projectName: normalizeNonEmpty(frontmatter.sourceProjectName),
    projectSlug: normalizeNonEmpty(frontmatter.sourceProjectSlug),
    scopeId: normalizeNonEmpty(frontmatter.sourceScopeId),
  })
}

function buildKindIndex(params: {
  kind: HostedMirrorKind
  records: HostedMirrorRecord[]
}): string {
  const label = params.kind === 'skill' ? 'Hosted Skills' : 'Hosted Prompts'
  const lines = [
    `# ${label}`,
    '',
    '> Read-only hosted mirror. Canonical edits remain on the hosted Agentspace side.',
    '',
    `- Count: ${params.records.length}`,
    '',
    '## Items',
  ]
  if (params.records.length === 0) {
    lines.push('', '(no mirrored items)')
    return `${lines.join('\n')}\n`
  }
  for (const record of params.records) {
    const title = normalizeNonEmpty(record.frontmatter.name) ?? normalizeNonEmpty(record.frontmatter.title) ?? normalizeNonEmpty(record.frontmatter.remoteId) ?? 'untitled'
    const description = normalizeNonEmpty(record.frontmatter.shortDescription)
      ?? normalizeNonEmpty(record.frontmatter.description)
    const remoteId = normalizeNonEmpty(record.frontmatter.remoteId) ?? '-'
    const currentVersionId = normalizeNonEmpty(record.frontmatter.currentVersionId) ?? '-'
    const parts = [
      description ? `purpose=${description}` : undefined,
      `source=${sourceLabel(record.frontmatter)}`,
      `remoteId=${remoteId}`,
      `currentVersionId=${currentVersionId}`,
    ].filter(Boolean)
    lines.push(`- [${title}](${path.basename(record.filePath)}) — ${parts.join(', ')}`)
  }
  return `${lines.join('\n')}\n`
}

function buildRootIndex(params: {
  skillRecords: HostedMirrorRecord[]
  promptRecords: HostedMirrorRecord[]
}): string {
  const sources = new Map<string, string>()
  for (const record of [...params.skillRecords, ...params.promptRecords]) {
    const key = hostedProjectKeyFromFrontmatter(record.frontmatter)
    if (!sources.has(key)) sources.set(key, sourceLabel(record.frontmatter))
  }
  const lines = [
    '# Hosted Read-Only Workspace',
    '',
    '> Hosted prompt/skill mirrors are local read-only context only. Canonical source remains DB/server.',
    '',
    `- Skills: ${params.skillRecords.length}`,
    `- Prompts: ${params.promptRecords.length}`,
    '',
    '- [Skills](skills/index.md)',
    '- [Prompts](prompts/index.md)',
    '',
    '## Sources',
  ]
  if (sources.size === 0) {
    lines.push('', '(no mirrored sources yet)')
  } else {
    for (const label of [...sources.values()].sort((left, right) => left.localeCompare(right))) {
      lines.push(`- ${label}`)
    }
  }
  return `${lines.join('\n')}\n`
}

export async function rebuildHostedWorkspace(repoRoot: string): Promise<string[]> {
  const paths = resolveHostedWorkspacePaths(repoRoot)
  await fs.rm(path.join(paths.root, 'projects'), { recursive: true, force: true })
  await fs.rm(path.join(paths.skillsRoot, 'items'), { recursive: true, force: true })
  await fs.rm(path.join(paths.promptsRoot, 'items'), { recursive: true, force: true })

  const skillRecords = await readMarkdownRecords(paths.skillsRoot)
  const promptRecords = await readMarkdownRecords(paths.promptsRoot)
  const written: string[] = []

  await fs.mkdir(paths.skillsRoot, { recursive: true })
  await fs.mkdir(paths.promptsRoot, { recursive: true })

  const skillsIndexPath = path.join(paths.skillsRoot, 'index.md')
  const promptsIndexPath = path.join(paths.promptsRoot, 'index.md')
  const rootIndexPath = path.join(paths.root, 'index.md')

  await writeFileWithRetry(skillsIndexPath, buildKindIndex({ kind: 'skill', records: skillRecords }), 'utf8')
  await writeFileWithRetry(promptsIndexPath, buildKindIndex({ kind: 'prompt', records: promptRecords }), 'utf8')
  await writeFileWithRetry(rootIndexPath, buildRootIndex({ skillRecords, promptRecords }), 'utf8')

  written.push(relativePath(repoRoot, skillsIndexPath))
  written.push(relativePath(repoRoot, promptsIndexPath))
  written.push(relativePath(repoRoot, rootIndexPath))
  return written
}

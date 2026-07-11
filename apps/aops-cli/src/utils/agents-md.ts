import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import {
  AOPS_AGENTS_MD_TEMPLATE_SEEDS,
  DISCUSS_AGENTS_MD_TEMPLATE_SLUG,
  DEFAULT_AGENTS_MD_TEMPLATE_SLUG,
  type AgentsMdTemplateSeed,
} from '../seeds/agents-md.js'
import { findWorkspaceRoot } from './workspace-root.js'

export const AGENTS_MD_MANAGED_BEGIN =
  '<!-- aops:agents-md-templates BEGIN version=1 managed-by=aops-cli -->'
export const AGENTS_MD_MANAGED_END = '<!-- aops:agents-md-templates END -->'

export type AgentsMdSelectionOptions = {
  discuss?: boolean
  all?: boolean
  noDefaultTask?: boolean
  embedPrompts?: boolean
}

export type AgentsMdUpdateOptions = AgentsMdSelectionOptions & {
  root?: string
  apply?: boolean
  preview?: boolean
  syncHosted?: boolean
}

export type AgentsMdResetOptions = {
  root?: string
  apply?: boolean
  preview?: boolean
  confirm?: boolean
}

export type ResolvedAgentsMdTarget = {
  rootDir: string
  filePath: string
}

export type AgentsMdUpdateResult = ResolvedAgentsMdTarget & {
  action: 'update'
  changed: boolean
  selectedTemplates: AgentsMdTemplateSeed[]
  block: string
  content?: string
  warnings: string[]
  syncHosted?: {
    command: string
    stdout: string
    stderr: string
  }
}

export type AgentsMdResetResult = ResolvedAgentsMdTarget & {
  action: 'reset'
  changed: boolean
  content?: string
  warnings: string[]
}

function normalizeBoolean(value: unknown): boolean {
  return value === true
}

function uniqueSeeds(seeds: AgentsMdTemplateSeed[]): AgentsMdTemplateSeed[] {
  const seen = new Set<string>()
  return seeds.filter((seed) => {
    if (seen.has(seed.slug)) return false
    seen.add(seed.slug)
    return true
  })
}

export function selectAgentsMdTemplates(options: AgentsMdSelectionOptions = {}): AgentsMdTemplateSeed[] {
  const all = normalizeBoolean(options.all)
  const noDefaultTask = normalizeBoolean(options.noDefaultTask)
  const discuss = normalizeBoolean(options.discuss)

  let selected = all ? [...AOPS_AGENTS_MD_TEMPLATE_SEEDS] : []
  if (!all && !noDefaultTask) {
    const seed = AOPS_AGENTS_MD_TEMPLATE_SEEDS.find((entry) => entry.slug === DEFAULT_AGENTS_MD_TEMPLATE_SLUG)
    if (seed) selected.push(seed)
  }
  if (discuss) {
    const seed = AOPS_AGENTS_MD_TEMPLATE_SEEDS.find((entry) => entry.slug === DISCUSS_AGENTS_MD_TEMPLATE_SLUG)
    if (seed) selected.push(seed)
  }
  if (noDefaultTask) {
    selected = selected.filter((entry) => entry.slug !== DEFAULT_AGENTS_MD_TEMPLATE_SLUG)
  }

  selected = uniqueSeeds(selected)
  if (selected.length === 0) {
    throw new Error('No AGENTS.md prompt templates selected. Drop --no-default-task or add --discuss/--all.')
  }

  return selected
}

export function resolveAgentsMdTarget(root?: string): ResolvedAgentsMdTarget {
  const startDir = process.cwd()
  const rootDir = root ? path.resolve(startDir, root) : findWorkspaceRoot(startDir)
  return {
    rootDir,
    filePath: path.join(rootDir, 'AGENTS.md'),
  }
}

function findInitSectionEnd(content: string): number | undefined {
  const match = content.match(/^#\s*INIT\b.*$/im)
  if (!match || match.index === undefined) return undefined

  const afterInitHeader = match.index + match[0].length
  const rest = content.slice(afterInitHeader)
  const nextTopLevelHeader = rest.match(/^\s*#(?!\s*INIT\b)/m)
  if (!nextTopLevelHeader || nextTopLevelHeader.index === undefined) return content.length
  return afterInitHeader + nextTopLevelHeader.index
}

function managedBlockPattern(): RegExp {
  const begin = AGENTS_MD_MANAGED_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const end = AGENTS_MD_MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\n*${begin}[\\s\\S]*?${end}\\n*`, 'm')
}

export function removeAgentsMdManagedBlock(content: string): { content: string; changed: boolean } {
  const pattern = managedBlockPattern()
  if (!pattern.test(content)) return { content, changed: false }
  const next = content.replace(pattern, '\n\n').replace(/\n{3,}/g, '\n\n').trimEnd()
  return { content: `${next}\n`, changed: true }
}

export function mergeAgentsMdManagedBlock(content: string, block: string): { content: string; changed: boolean } {
  const normalizedBlock = `${block.trimEnd()}\n`
  const pattern = managedBlockPattern()
  let next: string

  if (pattern.test(content)) {
    next = content.replace(pattern, `\n\n${normalizedBlock}\n`)
  } else if (content.trim().length === 0) {
    next = `${normalizedBlock}\n`
  } else {
    const insertAt = findInitSectionEnd(content)
    if (insertAt !== undefined) {
      const prefix = content.slice(0, insertAt).trimEnd()
      const suffix = content.slice(insertAt).trimStart()
      next = `${prefix}\n\n${normalizedBlock}\n${suffix}`
    } else {
      next = `${normalizedBlock}\n${content.replace(/^\uFEFF/, '').trimStart()}`
    }
  }

  next = `${next.trimEnd()}\n`
  return { content: next, changed: next !== content }
}

function promptMirrorPath(rootDir: string, seed: AgentsMdTemplateSeed): string {
  return path.join(rootDir, ...seed.mirrorPath.split('/'))
}

async function readPromptBody(rootDir: string, seed: AgentsMdTemplateSeed): Promise<string | undefined> {
  const filePath = promptMirrorPath(rootDir, seed)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return raw.trim()
  } catch {
    return undefined
  }
}

function markdownFenceFor(content: string): string {
  let fence = '~~~'
  while (content.includes(fence)) {
    fence += '~'
  }
  return fence
}

async function renderEmbeddedPrompt(rootDir: string, seed: AgentsMdTemplateSeed): Promise<string[]> {
  const body = (await readPromptBody(rootDir, seed)) ?? seed.snippet.map((line) => `- ${line}`).join('\n')
  const fence = markdownFenceFor(body)
  return [
    `<details><summary>${seed.title} body</summary>`,
    '',
    `${fence}markdown`,
    body,
    fence,
    '',
    '</details>',
  ]
}

export async function buildAgentsMdManagedBlock(
  rootDir: string,
  selectedTemplates: AgentsMdTemplateSeed[],
  options: { embedPrompts?: boolean } = {}
): Promise<{ block: string; warnings: string[] }> {
  const warnings: string[] = []
  const lines: string[] = [
    AGENTS_MD_MANAGED_BEGIN,
    '## AOPS Prompt Template Bootstrap',
    '',
    'This managed block is generated by `aops-cli agents-md update`.',
    'Keep project-specific agent rules outside this block.',
    '',
    'Refresh hosted prompt mirrors when needed:',
    '',
    '```bash',
    'aops-cli sync pull --apply --hosted-project-slug aops --json',
    '```',
    '',
    'Use `aops-cli agents-md preview --discuss` before adding the standalone discuss / decision-ritual guidance.',
    'Use `aops-cli agents-md update --discuss --apply` to inject it.',
    '',
    'Selected templates:',
    '',
  ]

  for (const seed of selectedTemplates) {
    lines.push(`### ${seed.title}`)
    lines.push('')
    lines.push(`- Slug: \`${seed.slug}\``)
    lines.push(`- Ref: \`${seed.promptRef}\``)
    lines.push(`- Mirror: \`${seed.mirrorPath}\``)
    lines.push(`- Purpose: ${seed.description}`)
    lines.push('- Runtime reminder:')
    seed.snippet.forEach((entry) => lines.push(`  - ${entry}`))
    lines.push('')

    if (options.embedPrompts === true) {
      const embedded = await renderEmbeddedPrompt(rootDir, seed)
      lines.push(...embedded, '')
    }
  }

  if (options.embedPrompts === true) {
    warnings.push('Embedded prompt bodies can make AGENTS.md large; prefer mirrors unless offline bootstrap requires embedding.')
  } else {
    lines.push('Prompt bodies stay in hosted mirrors by default. Use `--embed-prompts` only for explicit offline bootstrap needs.')
    lines.push('')
  }

  lines.push(AGENTS_MD_MANAGED_END)
  return {
    block: `${lines.join('\n').trimEnd()}\n`,
    warnings,
  }
}

async function readAgentsFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return ''
    throw error
  }
}

function resolveCliInvocation(): { command: string; argsPrefix: string[] } {
  if (process.env.AOPS_CLI_BIN) return { command: process.env.AOPS_CLI_BIN, argsPrefix: [] }

  const entrypoint = process.argv[1]
  if (entrypoint && entrypoint.endsWith('.js')) {
    return { command: process.execPath, argsPrefix: [entrypoint] }
  }

  return { command: 'aops-cli', argsPrefix: [] }
}

async function runHostedSync(rootDir: string): Promise<{ command: string; stdout: string; stderr: string }> {
  const cli = resolveCliInvocation()
  const args = ['sync', 'pull', '--apply', '--hosted-project-slug', 'aops', '--json']
  const spawnArgs = [...cli.argsPrefix, ...args]

  return await new Promise((resolve, reject) => {
    const child = spawn(cli.command, spawnArgs, {
      cwd: rootDir,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      reject(error)
    })
    child.on('close', (code) => {
      const command = [cli.command, ...spawnArgs].join(' ')
      if (code === 0) {
        resolve({ command, stdout: stdout.trim(), stderr: stderr.trim() })
        return
      }
      reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim() || stdout.trim()}`))
    })
  })
}

export async function updateAgentsMdFile(options: AgentsMdUpdateOptions = {}): Promise<AgentsMdUpdateResult> {
  if (options.apply !== true && options.preview !== true) {
    throw new Error('This command updates AGENTS.md. Retry with --apply or use --preview.')
  }
  if (options.preview === true && options.syncHosted === true) {
    throw new Error('--sync-hosted mutates .aops/hosted mirrors. Use `aops-cli agents-md update --sync-hosted --apply`.')
  }

  const target = resolveAgentsMdTarget(options.root)
  const selectedTemplates = selectAgentsMdTemplates(options)
  const syncHosted = options.syncHosted === true ? await runHostedSync(target.rootDir) : undefined
  const { block, warnings } = await buildAgentsMdManagedBlock(target.rootDir, selectedTemplates, {
    embedPrompts: options.embedPrompts,
  })
  const current = await readAgentsFile(target.filePath)
  const merged = mergeAgentsMdManagedBlock(current, block)

  if (options.apply === true) {
    await fs.mkdir(path.dirname(target.filePath), { recursive: true })
    await fs.writeFile(target.filePath, merged.content, 'utf-8')
  }

  return {
    action: 'update',
    ...target,
    changed: merged.changed,
    selectedTemplates,
    block,
    content: options.preview === true ? merged.content : undefined,
    warnings,
    syncHosted,
  }
}

export async function resetAgentsMdFile(options: AgentsMdResetOptions = {}): Promise<AgentsMdResetResult> {
  if (options.preview !== true && !(options.apply === true && options.confirm === true)) {
    throw new Error('This command removes the managed AGENTS.md block. Retry with --apply --confirm or use --preview.')
  }

  const target = resolveAgentsMdTarget(options.root)
  const current = existsSync(target.filePath) ? await readAgentsFile(target.filePath) : ''
  const removed = removeAgentsMdManagedBlock(current)

  if (options.apply === true && options.confirm === true && removed.changed) {
    await fs.writeFile(target.filePath, removed.content, 'utf-8')
  }

  return {
    action: 'reset',
    ...target,
    changed: removed.changed,
    content: options.preview === true ? removed.content : undefined,
    warnings: [],
  }
}

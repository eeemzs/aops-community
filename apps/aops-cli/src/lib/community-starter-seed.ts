import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { resolveCommunityNativePaths } from './community-native-lifecycle.js'

export const COMMUNITY_STARTER_SEED_VERSION = 1
export const COMMUNITY_STARTER_PROJECT_SLUG = 'aops-starter'
export const COMMUNITY_STARTER_BOARD_SLUG = 'getting-started'
export const COMMUNITY_STARTER_GUIDE_SLUG = 'aops-getting-started'

const MAX_CHILD_OUTPUT_BYTES = 2 * 1024 * 1024
const DEFAULT_CHILD_TIMEOUT_MS = 60_000

export const COMMUNITY_STARTER_USER_GUIDE = `# AOPS Getting Started

Welcome to your AOPS Community workspace.

## First steps

1. Open Cockpit with \`aops cockpit\`.
2. Inspect the **Getting Started** board and the **First AOPS Sprint** plan.
3. Ask an agent to run \`aops setup guide\` and inspect the installed verified AOPS Gateway skill.
4. Try \`aops agent tools\` or \`aops view dashboard --style agent\`.

This small starter dataset is safe to edit or delete. For a managed Docker PostgreSQL installation, \`aops server reset --remove-managed-postgres --confirm-data-loss --confirm-instance default\` removes the label-verified database and local installation state; run \`aops setup init\` again to start clean.
`

export type CommunityStarterSeedReceiptV1 = Readonly<{
  schemaVersion: 1
  seedVersion: 1
  seedFingerprintSha256: string
  seededAt: string
  instance: string
  origin: string
  entities: Readonly<{
    projectId: string
    boardId: string
    taskId: string
    sprintId: string
    documentGroupId: string
    documentId: string
    documentVersionId: string
  }>
}>

export type CommunityStarterSeedRunner = Readonly<{
  run(args: readonly string[], options: Readonly<{
    cwd: string
    timeoutMs?: number
    signal?: AbortSignal
  }>): Promise<Record<string, unknown>>
}>

export type CommunityStarterSeedOptions = Readonly<{
  instanceName?: string
  dataRoot?: string
  origin: string
  apply?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

export const COMMUNITY_STARTER_SEED_FINGERPRINT = sha256(JSON.stringify({
  version: COMMUNITY_STARTER_SEED_VERSION,
  project: COMMUNITY_STARTER_PROJECT_SLUG,
  board: COMMUNITY_STARTER_BOARD_SLUG,
  guide: COMMUNITY_STARTER_GUIDE_SLUG,
  guideContent: COMMUNITY_STARTER_USER_GUIDE,
}))

function appendBounded(current: string, chunk: Buffer): string {
  const next = current + chunk.toString('utf8')
  if (Buffer.byteLength(next, 'utf8') > MAX_CHILD_OUTPUT_BYTES) {
    throw new Error('community_starter_seed_child_output_too_large')
  }
  return next
}

export const communityStarterSeedRunner: CommunityStarterSeedRunner = Object.freeze({
  run(args, options) {
    return new Promise((resolve, reject) => {
      const entry = fileURLToPath(new URL('../main.js', import.meta.url))
      let stdout = ''
      let stderr = ''
      let settled = false
      const child = spawn(process.execPath, [entry, ...args], {
        cwd: options.cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        finish(new Error('community_starter_seed_child_timeout'))
      }, options.timeoutMs ?? DEFAULT_CHILD_TIMEOUT_MS)
      const onAbort = () => {
        child.kill('SIGTERM')
        finish(new Error('community_starter_seed_aborted'))
      }
      function finish(error?: Error, value?: Record<string, unknown>): void {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', onAbort)
        if (error) reject(error)
        else resolve(value ?? {})
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      if (options.signal?.aborted) onAbort()
      child.stdout.on('data', (chunk: Buffer) => {
        try { stdout = appendBounded(stdout, chunk) } catch (error) { child.kill('SIGTERM'); finish(error as Error) }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        try { stderr = appendBounded(stderr, chunk) } catch (error) { child.kill('SIGTERM'); finish(error as Error) }
      })
      child.once('error', (error) => finish(error))
      child.once('exit', (code, signal) => {
        if (settled) return
        if (code !== 0) {
          finish(new Error(`community_starter_seed_command_failed:${code ?? signal ?? 'unknown'}:${stderr.trim().slice(-1_000)}`))
          return
        }
        try {
          const parsed = JSON.parse(stdout.trim())
          if (!isRecord(parsed)) throw new Error('community_starter_seed_command_json_invalid')
          finish(undefined, parsed)
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  },
})

function findHintedObject(value: unknown, hints: readonly string[], depth = 0): Record<string, unknown> | undefined {
  if (depth > 8 || !isRecord(value)) return undefined
  for (const hint of hints) {
    const candidate = value[hint]
    if (isRecord(candidate) && nonEmpty(candidate.id)) return candidate
  }
  for (const key of ['result', 'response', 'data', ...hints]) {
    const candidate = value[key]
    const found = findHintedObject(candidate, hints, depth + 1)
    if (found) return found
  }
  if (nonEmpty(value.id)) return value
  for (const candidate of Object.values(value)) {
    const found = findHintedObject(candidate, hints, depth + 1)
    if (found) return found
  }
  return undefined
}

export function extractCommunityStarterEntityId(
  payload: Record<string, unknown>,
  hints: readonly string[],
): string {
  const record = findHintedObject(payload.result ?? payload, hints)
  const id = nonEmpty(record?.id)
  if (!id) throw new Error(`community_starter_seed_entity_id_missing:${hints.join(',')}`)
  return id
}

function seedReceiptPath(instanceName: string, dataRoot?: string): string {
  return path.join(resolveCommunityNativePaths({ instanceName, dataRoot }).runtimeRoot, 'starter-seed-v1.json')
}

function parseReceipt(value: unknown, instanceName: string): CommunityStarterSeedReceiptV1 {
  if (!isRecord(value) || !isRecord(value.entities)) throw new Error('community_starter_seed_receipt_invalid')
  const entities = value.entities
  const ids = [
    entities.projectId,
    entities.boardId,
    entities.taskId,
    entities.sprintId,
    entities.documentGroupId,
    entities.documentId,
    entities.documentVersionId,
  ]
  if (
    value.schemaVersion !== 1 || value.seedVersion !== 1 || value.instance !== instanceName ||
    value.seedFingerprintSha256 !== COMMUNITY_STARTER_SEED_FINGERPRINT ||
    !nonEmpty(value.origin) || Number.isNaN(Date.parse(String(value.seededAt))) ||
    ids.some((id) => !nonEmpty(id))
  ) throw new Error('community_starter_seed_receipt_invalid')
  return value as unknown as CommunityStarterSeedReceiptV1
}

export function readCommunityStarterSeedReceipt(instanceName = 'default', dataRoot?: string): CommunityStarterSeedReceiptV1 | null {
  const receiptPath = seedReceiptPath(instanceName, dataRoot)
  if (!existsSync(receiptPath)) return null
  const stats = lstatSync(receiptPath)
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 2 || stats.size > 65_536) {
    throw new Error('community_starter_seed_receipt_unsafe')
  }
  return parseReceipt(JSON.parse(readFileSync(receiptPath, 'utf8')), instanceName)
}

function writeReceipt(instanceName: string, dataRoot: string | undefined, receipt: CommunityStarterSeedReceiptV1): string {
  const receiptPath = seedReceiptPath(instanceName, dataRoot)
  const runtimeRoot = path.dirname(receiptPath)
  mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 })
  const stats = lstatSync(runtimeRoot)
  if (!stats.isDirectory() || stats.isSymbolicLink() || path.resolve(realpathSync(runtimeRoot)) !== path.resolve(runtimeRoot)) {
    throw new Error('community_starter_seed_runtime_root_unsafe')
  }
  const temporary = path.join(runtimeRoot, `.starter-seed.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  let descriptor: number | undefined
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, receiptPath)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
  }
  return receiptPath
}

function common(origin: string): string[] {
  return ['--api-base-url', origin, '--timeout-ms', '30000', '--json']
}

function owner(projectId: string): string[] {
  return ['--project-id', projectId, '--scope-id', projectId]
}

export async function seedCommunityStarterData(
  options: CommunityStarterSeedOptions,
  runner: CommunityStarterSeedRunner = communityStarterSeedRunner,
): Promise<Readonly<Record<string, unknown>>> {
  const instanceName = nonEmpty(options.instanceName)?.toLowerCase() ?? 'default'
  const paths = resolveCommunityNativePaths({ instanceName, dataRoot: options.dataRoot })
  const existing = readCommunityStarterSeedReceipt(instanceName, options.dataRoot)
  if (existing) {
    return Object.freeze({ status: 'already-seeded', receipt: existing, receiptPath: seedReceiptPath(instanceName, options.dataRoot) })
  }
  if (options.apply !== true) {
    return Object.freeze({
      status: 'preview',
      mutationFree: true,
      seedVersion: COMMUNITY_STARTER_SEED_VERSION,
      projectSlug: COMMUNITY_STARTER_PROJECT_SLUG,
      boardSlug: COMMUNITY_STARTER_BOARD_SLUG,
      documentSlug: COMMUNITY_STARTER_GUIDE_SLUG,
    })
  }

  const run = (args: readonly string[]) => runner.run(args, {
    cwd: paths.instanceRoot,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })
  const project = await run([
    'project', 'create', '--name', 'AOPS Starter', '--slug', COMMUNITY_STARTER_PROJECT_SLUG,
    '--description', 'A small first workspace for learning AOPS Community.',
    '--idempotency-key', 'aops-starter-project-v1', '--apply', ...common(options.origin),
  ])
  const projectId = extractCommunityStarterEntityId(project, ['project'])
  const board = await run([
    'pm', 'board', 'create', '--name', 'Getting Started', '--slug', COMMUNITY_STARTER_BOARD_SLUG,
    '--description', 'A small board for exploring AOPS planning.',
    '--column', 'Backlog', '--column', 'Todo', '--column', 'Doing', '--column', 'Done',
    '--idempotency-key', 'aops-starter-board-v1', '--apply', ...owner(projectId), ...common(options.origin),
  ])
  const boardId = extractCommunityStarterEntityId(board, ['board'])
  const task = await run([
    'pm', 'ktask', 'create', '--board', boardId, '--column', 'Todo',
    '--title', 'Explore AOPS Community',
    '--description', 'Open Cockpit, inspect this plan, and try one agent or CLI operation.',
    '--idempotency-key', 'aops-starter-task-v1', '--apply', ...owner(projectId), ...common(options.origin),
  ])
  const taskId = extractCommunityStarterEntityId(task, ['task', 'kanbanTask'])
  const sprint = await run([
    'pm', 'sprint', 'create', '--task', taskId, '--name', 'First AOPS Sprint',
    '--goal', 'NE: Explore the starter workspace. NICIN: Learn the smallest useful AOPS loop. DONE-WHEN: Cockpit is opened and one CLI or agent operation is tried.',
    '--scope-item', 'Inspect the Getting Started board', '--scope-item', 'Try one AOPS command',
    '--validation-item', 'The local server remains healthy', '--idempotency-key', 'aops-starter-sprint-v1',
    '--apply', ...owner(projectId), ...common(options.origin),
  ])
  const sprintId = extractCommunityStarterEntityId(sprint, ['sprint'])
  await run([
    'pm', 'sprint', 'update-plan', '--id', sprintId, '--phases-json', JSON.stringify([
      {
        name: 'Explore the workspace',
        position: 0,
        microtasks: [
          { title: 'Open Cockpit and inspect the starter project', status: 'todo', position: 0 },
          { title: 'Try one AOPS CLI or agent operation', status: 'todo', position: 1 },
        ],
      },
    ]), '--idempotency-key', 'aops-starter-sprint-plan-v1', '--apply',
    ...owner(projectId), ...common(options.origin),
  ])
  const group = await run([
    'doc', 'group', 'create', '--title', 'Getting Started', '--group-uid', 'getting-started',
    '--idempotency-key', 'aops-starter-doc-group-v1', '--apply', ...owner(projectId), ...common(options.origin),
  ])
  const documentGroupId = extractCommunityStarterEntityId(group, ['group', 'documentGroup'])
  const document = await run([
    'doc', 'create', '--title', 'AOPS Getting Started', '--document-uid', 'aops-getting-started',
    '--slug', COMMUNITY_STARTER_GUIDE_SLUG, '--summary', 'The smallest useful AOPS walkthrough.',
    '--group-id', documentGroupId, '--status', 'draft', '--visibility', 'internal',
    '--idempotency-key', 'aops-starter-document-v1', '--apply', ...owner(projectId), ...common(options.origin),
  ])
  const documentId = extractCommunityStarterEntityId(document, ['document'])
  const version = await run([
    'doc', 'version', 'create', '--document-id', documentId, '--version', '1',
    '--title', 'AOPS Getting Started', '--status', 'draft', '--init-mode', 'clean',
    '--idempotency-key', 'aops-starter-document-version-v1', '--apply',
    ...owner(projectId), ...common(options.origin),
  ])
  const documentVersionId = extractCommunityStarterEntityId(version, ['documentVersion', 'version'])
  const section = await run([
    'doc', 'section', 'create', '--title', 'Getting Started', '--section-uid', 'getting-started',
    '--slug', 'getting-started', '--document-version-id', documentVersionId,
    '--idempotency-key', 'aops-starter-guide-section-v1', '--apply',
    ...owner(projectId), ...common(options.origin),
  ])
  const sectionId = extractCommunityStarterEntityId(section, ['section'])
  await run([
    'doc', 'page', 'create', '--title', 'First Steps', '--page-uid', 'first-steps',
    '--document-version-id', documentVersionId, '--section-id', sectionId,
    '--format', 'md', '--content', COMMUNITY_STARTER_USER_GUIDE,
    '--idempotency-key', 'aops-starter-guide-page-v1', '--apply',
    ...owner(projectId), ...common(options.origin),
  ])
  await run([
    'doc', 'set-current-version', '--document-id', documentId, '--version-id', documentVersionId,
    '--publish-now', '--idempotency-key', 'aops-starter-guide-publish-v1', '--apply',
    ...owner(projectId), ...common(options.origin),
  ])

  const receipt: CommunityStarterSeedReceiptV1 = Object.freeze({
    schemaVersion: 1,
    seedVersion: 1,
    seedFingerprintSha256: COMMUNITY_STARTER_SEED_FINGERPRINT,
    seededAt: new Date().toISOString(),
    instance: instanceName,
    origin: options.origin,
    entities: Object.freeze({
      projectId,
      boardId,
      taskId,
      sprintId,
      documentGroupId,
      documentId,
      documentVersionId,
    }),
  })
  const receiptPath = writeReceipt(instanceName, options.dataRoot, receipt)
  return Object.freeze({ status: 'seeded', receipt, receiptPath })
}

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  existsSync,
  createReadStream,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SHA256 = /^sha256:[a-f0-9]{64}$/
const INSTANCE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

export type CommunityRelease = {
  schemaVersion: 1
  releaseVersion: string
  image: {
    repository: string
    tag: string
    indexDigest: string
  }
  compose: {
    ref: string
    sha256: string
  }
  migrations: {
    setDigest: string
    tags: string[]
  }
}

export type CommunityReleaseIdentity = {
  releaseVersion: string
  imageRef: string
  imageIndexDigest: string
  migrationSetDigest: string
  migrationTags: string[]
  manifestSha256: string
  composeSha256: string
}

export type CommunityInstalledRelease = CommunityReleaseIdentity & {
  manifestPath: string
  composePath: string
}

export type CommunityBackupRecord = {
  path: string
  sha256: string
  byteLength: number
  verified: true
  createdAt: string
  sourceRelease: CommunityInstalledRelease
}

export type CommunityUpdateRecord = {
  id: string
  status: 'started' | 'succeeded' | 'failed' | 'rolled-back'
  startedAt: string
  finishedAt?: string
  priorRelease: CommunityInstalledRelease
  targetRelease: CommunityInstalledRelease
  backup: CommunityBackupRecord
  failure?: string
  migrationMayHaveStarted?: boolean
  replacementVolumeName?: string
}

export type CommunityInstallState = {
  schemaVersion: 1
  instanceName: string
  installId: string
  composeProjectName: string
  postgresVolumeName: string
  createdAt: string
  updatedAt: string
  activeRelease: CommunityInstalledRelease
  previousRelease: CommunityInstalledRelease | null
  lastSuccessfulUpdateId: string | null
}

export type CommunityInstallPaths = {
  dataRoot: string
  instanceRoot: string
  runtimeRoot: string
  releaseCacheRoot: string
  backupRoot: string
  statePath: string
  envPath: string
  composePath: string
  releasePath: string
  ledgerPath: string
}

export type CommunityLifecycleAdapter = {
  verifyRelease: (release: CommunityInstalledRelease) => Promise<void>
  createBackup: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
  }) => Promise<CommunityBackupRecord>
  stop: (params: { paths: CommunityInstallPaths; state: CommunityInstallState }) => Promise<void>
  pull: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
    release: CommunityInstalledRelease
  }) => Promise<void>
  start: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
    release: CommunityInstalledRelease
    postgresVolumeName: string
  }) => Promise<void>
  health: (params: { paths: CommunityInstallPaths; state: CommunityInstallState }) => Promise<void>
  dataSmoke: (params: { paths: CommunityInstallPaths; state: CommunityInstallState }) => Promise<void>
  restoreBackup: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
    backup: CommunityBackupRecord
    postgresVolumeName: string
  }) => Promise<void>
}

export type CommunityComposeInvocation = {
  command: 'docker'
  args: string[]
  env: Record<string, string>
}

function sha256(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function nowIso(now: () => Date): string {
  return now().toISOString()
}

function assertAbsolute(value: string, code: string): string {
  if (!path.isAbsolute(value)) throw new Error(code)
  return path.resolve(value)
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assertInstanceName(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!INSTANCE_NAME.test(normalized)) throw new Error('community_instance_name_invalid')
  return normalized
}

function assertDigest(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(code)
}

function assertReleaseIdentity(value: unknown): asserts value is CommunityReleaseIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_installed_release_invalid')
  }
  const release = value as Partial<CommunityInstalledRelease>
  if (typeof release.releaseVersion !== 'string' || !release.releaseVersion) {
    throw new Error('community_installed_release_version_invalid')
  }
  assertDigest(release.imageIndexDigest, 'community_installed_release_index_digest_invalid')
  assertDigest(release.migrationSetDigest, 'community_installed_release_migration_digest_invalid')
  assertDigest(release.manifestSha256, 'community_installed_release_manifest_digest_invalid')
  assertDigest(release.composeSha256, 'community_installed_release_compose_digest_invalid')
  const expectedImageRef = `${String(release.imageRef).split('@')[0]}@${release.imageIndexDigest}`
  if (release.imageRef !== expectedImageRef || !release.imageRef.startsWith('ghcr.io/')) {
    throw new Error('community_installed_release_image_ref_invalid')
  }
  if (!Array.isArray(release.migrationTags) || release.migrationTags.some((tag) => typeof tag !== 'string' || !tag)) {
    throw new Error('community_installed_release_migration_tags_invalid')
  }
}

function assertInstalledRelease(value: unknown): asserts value is CommunityInstalledRelease {
  assertReleaseIdentity(value)
  const release = value as CommunityInstalledRelease
  for (const [filePath, expectedDigest, code] of [
    [release.manifestPath, release.manifestSha256, 'community_installed_release_manifest_file_invalid'],
    [release.composePath, release.composeSha256, 'community_installed_release_compose_file_invalid'],
  ] as const) {
    if (!path.isAbsolute(filePath) || !existsSync(filePath) || !statSync(filePath).isFile()) throw new Error(code)
    if (sha256(readFileSync(filePath)) !== expectedDigest) throw new Error(`${code}_digest_mismatch`)
  }
}

function atomicWrite(filePath: string, content: string, mode?: number): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}-${randomUUID()}.tmp`
  try {
    writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'wx', mode })
    let lastError: unknown
    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        renameSync(tempPath, filePath)
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        const code = (error as NodeJS.ErrnoException)?.code
        if (process.platform !== 'win32' || !['EACCES', 'EBUSY', 'EPERM'].includes(String(code)) || attempt === 6) {
          throw error
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1))
      }
    }
    if (lastError) throw lastError
  } finally {
    rmSync(tempPath, { force: true })
  }
}

function writeCreateOnce(filePath: string, content: string, mode?: number): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx', mode })
}

function parseJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`community_json_read_failed:${filePath}`, { cause: error })
  }
}

export function resolveCommunityDataRoot(options: {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): string {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const pathImpl = platform === 'win32' ? path.win32 : path.posix
  const homeDir = pathImpl.resolve(options.homeDir ?? os.homedir())
  if (env.AOPS_COMMUNITY_HOME) {
    if (!pathImpl.isAbsolute(env.AOPS_COMMUNITY_HOME)) throw new Error('community_home_absolute_required')
    return pathImpl.resolve(env.AOPS_COMMUNITY_HOME)
  }
  if (platform === 'win32') {
    return pathImpl.join(pathImpl.resolve(env.LOCALAPPDATA ?? pathImpl.join(homeDir, 'AppData', 'Local')), 'AOPS', 'Community')
  }
  if (platform === 'darwin') {
    return pathImpl.join(homeDir, 'Library', 'Application Support', 'AOPS', 'Community')
  }
  return pathImpl.join(pathImpl.resolve(env.XDG_DATA_HOME ?? pathImpl.join(homeDir, '.local', 'share')), 'aops', 'community')
}

export function resolveCommunityInstallPaths(options: {
  instanceName?: string
  dataRoot?: string
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): CommunityInstallPaths {
  const dataRoot = options.dataRoot
    ? assertAbsolute(options.dataRoot, 'community_data_root_absolute_required')
    : resolveCommunityDataRoot(options)
  const instanceName = assertInstanceName(options.instanceName ?? 'default')
  const instanceRoot = path.join(dataRoot, 'instances', instanceName)
  const runtimeRoot = path.join(instanceRoot, 'runtime')
  return {
    dataRoot,
    instanceRoot,
    runtimeRoot,
    releaseCacheRoot: path.join(instanceRoot, 'releases'),
    backupRoot: path.join(instanceRoot, 'backups'),
    statePath: path.join(instanceRoot, 'install-state.json'),
    envPath: path.join(instanceRoot, 'runtime.env'),
    composePath: path.join(runtimeRoot, 'compose.yaml'),
    releasePath: path.join(runtimeRoot, 'release.json'),
    ledgerPath: path.join(instanceRoot, 'update-ledger.json'),
  }
}

export function parseCommunityRelease(manifestContent: string, composeContent: string): CommunityReleaseIdentity {
  let manifest: CommunityRelease
  try {
    manifest = JSON.parse(manifestContent) as CommunityRelease
  } catch (error) {
    throw new Error('community_release_manifest_json_invalid', { cause: error })
  }
  if (manifest?.schemaVersion !== 1 || typeof manifest.releaseVersion !== 'string' || !manifest.releaseVersion) {
    throw new Error('community_release_manifest_invalid')
  }
  assertDigest(manifest.image?.indexDigest, 'community_release_index_digest_invalid')
  assertDigest(manifest.compose?.sha256, 'community_release_compose_digest_invalid')
  assertDigest(manifest.migrations?.setDigest, 'community_release_migration_digest_invalid')
  if (!Array.isArray(manifest.migrations?.tags) || manifest.migrations.tags.some((tag) => typeof tag !== 'string' || !tag)) {
    throw new Error('community_release_migration_tags_invalid')
  }
  if (sha256(composeContent) !== manifest.compose.sha256) {
    throw new Error('community_release_compose_digest_mismatch')
  }
  const release: CommunityReleaseIdentity = {
    releaseVersion: manifest.releaseVersion,
    imageRef: `${manifest.image.repository}@${manifest.image.indexDigest}`,
    imageIndexDigest: manifest.image.indexDigest,
    migrationSetDigest: manifest.migrations.setDigest,
    migrationTags: [...manifest.migrations.tags],
    manifestSha256: sha256(manifestContent),
    composeSha256: manifest.compose.sha256,
  }
  assertReleaseIdentity(release)
  return release
}

export function verifyStagedCommunityRelease(release: CommunityInstalledRelease): void {
  assertInstalledRelease(release)
  const observed = parseCommunityRelease(
    readFileSync(release.manifestPath, 'utf8'),
    readFileSync(release.composePath, 'utf8'),
  )
  for (const key of [
    'releaseVersion',
    'imageRef',
    'imageIndexDigest',
    'migrationSetDigest',
    'manifestSha256',
    'composeSha256',
  ] as const) {
    if (observed[key] !== release[key]) throw new Error(`community_staged_release_identity_mismatch:${key}`)
  }
  if (JSON.stringify(observed.migrationTags) !== JSON.stringify(release.migrationTags)) {
    throw new Error('community_staged_release_identity_mismatch:migrationTags')
  }
}

export function stageCommunityRelease(options: {
  paths: CommunityInstallPaths
  manifestContent: string
  composeContent: string
  manifestVerified: boolean
}): CommunityInstalledRelease {
  if (options.manifestVerified !== true) throw new Error('community_release_verification_required')
  const identity = parseCommunityRelease(options.manifestContent, options.composeContent)
  const releaseRoot = path.join(options.paths.releaseCacheRoot, identity.manifestSha256.slice('sha256:'.length))
  const manifestPath = path.join(releaseRoot, 'release.json')
  const composePath = path.join(releaseRoot, 'compose.yaml')
  mkdirSync(releaseRoot, { recursive: true })
  for (const [filePath, content, expectedDigest] of [
    [manifestPath, options.manifestContent, identity.manifestSha256],
    [composePath, options.composeContent, identity.composeSha256],
  ] as const) {
    if (!existsSync(filePath)) writeCreateOnce(filePath, content, 0o600)
    if (sha256(readFileSync(filePath)) !== expectedDigest) throw new Error('community_release_cache_digest_mismatch')
  }
  const release = { ...identity, manifestPath, composePath }
  assertInstalledRelease(release)
  return release
}

export function readCommunityInstallState(paths: CommunityInstallPaths): CommunityInstallState {
  const value = parseJsonFile(paths.statePath)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_install_state_invalid')
  }
  const state = value as CommunityInstallState
  if (state.schemaVersion !== 1 || !INSTANCE_NAME.test(state.instanceName)) {
    throw new Error('community_install_state_schema_invalid')
  }
  if (!/^[0-9a-f-]{36}$/.test(state.installId)) throw new Error('community_install_id_invalid')
  if (state.composeProjectName !== `aops-community-${state.installId.replace(/-/g, '').slice(0, 12)}`) {
    throw new Error('community_compose_project_identity_invalid')
  }
  if (!state.postgresVolumeName.startsWith(`${state.composeProjectName}-pg-`)) {
    throw new Error('community_postgres_volume_identity_invalid')
  }
  assertInstalledRelease(state.activeRelease)
  if (state.previousRelease !== null) assertInstalledRelease(state.previousRelease)
  return state
}

export type CommunityInstallInspection = {
  status: 'not-installed' | 'partial' | 'installed'
  paths: CommunityInstallPaths
  presentFiles: string[]
  missingFiles: string[]
  state?: CommunityInstallState
  error?: string
}

export function inspectCommunityInstall(options: {
  instanceName?: string
  dataRoot?: string
} = {}): CommunityInstallInspection {
  const paths = resolveCommunityInstallPaths(options)
  const required = [paths.statePath, paths.envPath, paths.composePath, paths.releasePath, paths.ledgerPath]
  const presentFiles = required.filter((filePath) => existsSync(filePath))
  const missingFiles = required.filter((filePath) => !existsSync(filePath))
  if (presentFiles.length === 0) return { status: 'not-installed', paths, presentFiles, missingFiles }
  if (!existsSync(paths.statePath)) {
    return { status: 'partial', paths, presentFiles, missingFiles, error: 'community_install_state_missing' }
  }
  try {
    const state = readCommunityInstallState(paths)
    if (missingFiles.length > 0) {
      return { status: 'partial', paths, presentFiles, missingFiles, state, error: 'community_install_files_missing' }
    }
    return { status: 'installed', paths, presentFiles, missingFiles, state }
  } catch (error) {
    return {
      status: 'partial',
      paths,
      presentFiles,
      missingFiles,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function readCommunityRuntimePort(paths: CommunityInstallPaths): number {
  const content = readFileSync(paths.envPath, 'utf8')
  const value = /^AOPS_PORT=(\d+)\s*$/m.exec(content)?.[1]
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('community_runtime_port_invalid')
  return port
}

function renderRuntimeEnv(params: {
  state: CommunityInstallState
  postgresPassword: string
  chatv3ServerKey: string
  port: number
}): string {
  return [
    '# Managed by aops-cli Community lifecycle. Keep this file private.',
    `COMPOSE_PROJECT_NAME=${params.state.composeProjectName}`,
    `AOPS_INSTALL_ID=${params.state.installId}`,
    `AOPS_IMAGE_REF=${params.state.activeRelease.imageRef}`,
    `AOPS_POSTGRES_VOLUME_NAME=${params.state.postgresVolumeName}`,
    'AOPS_POSTGRES_DB=aops',
    'AOPS_POSTGRES_USER=aops',
    `AOPS_POSTGRES_PASSWORD=${params.postgresPassword}`,
    'CHATV3_SERVER_KEY_ID=k1',
    `CHATV3_SERVER_KEY_SECRET=${params.chatv3ServerKey}`,
    `AOPS_PORT=${params.port}`,
    '',
  ].join('\n')
}

function updateRuntimeEnvBindings(paths: CommunityInstallPaths, state: CommunityInstallState): void {
  const managed = new Map([
    ['COMPOSE_PROJECT_NAME', state.composeProjectName],
    ['AOPS_INSTALL_ID', state.installId],
    ['AOPS_IMAGE_REF', state.activeRelease.imageRef],
    ['AOPS_POSTGRES_VOLUME_NAME', state.postgresVolumeName],
  ])
  const seen = new Set<string>()
  const lines = readFileSync(paths.envPath, 'utf8').split(/\r?\n/).map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line)
    const key = match?.[1]
    if (!key || !managed.has(key)) return line
    seen.add(key)
    return `${key}=${managed.get(key)}`
  })
  for (const [key, value] of managed) {
    if (!seen.has(key)) lines.push(`${key}=${value}`)
  }
  atomicWrite(paths.envPath, `${lines.join('\n').replace(/\n+$/g, '')}\n`, 0o600)
}

export function setupCommunityInstall(options: {
  manifestContent: string
  composeContent: string
  manifestVerified: boolean
  instanceName?: string
  dataRoot?: string
  port?: number
  now?: () => Date
  createInstallId?: () => string
  createSecret?: () => string
}): { status: 'created' | 'existing'; paths: CommunityInstallPaths; state: CommunityInstallState } {
  if (options.manifestVerified !== true) throw new Error('community_release_verification_required')
  const paths = resolveCommunityInstallPaths({ instanceName: options.instanceName, dataRoot: options.dataRoot })
  if (existsSync(paths.statePath)) {
    return { status: 'existing', paths, state: readCommunityInstallState(paths) }
  }
  const now = options.now ?? (() => new Date())
  const installId = (options.createInstallId ?? randomUUID)()
  if (!/^[0-9a-f-]{36}$/.test(installId)) throw new Error('community_install_id_invalid')
  const port = options.port ?? 5900
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('community_port_invalid')
  const composeProjectName = `aops-community-${installId.replace(/-/g, '').slice(0, 12)}`
  const createdAt = nowIso(now)
  mkdirSync(paths.backupRoot, { recursive: true })
  const release = stageCommunityRelease({
    paths,
    manifestContent: options.manifestContent,
    composeContent: options.composeContent,
    manifestVerified: true,
  })
  const state: CommunityInstallState = {
    schemaVersion: 1,
    instanceName: assertInstanceName(options.instanceName ?? 'default'),
    installId,
    composeProjectName,
    postgresVolumeName: `${composeProjectName}-pg-1`,
    createdAt,
    updatedAt: createdAt,
    activeRelease: release,
    previousRelease: null,
    lastSuccessfulUpdateId: null,
  }
  const secret = options.createSecret ?? (() => randomBytes(32).toString('base64url'))
  writeCreateOnce(paths.composePath, options.composeContent)
  writeCreateOnce(paths.releasePath, options.manifestContent)
  writeCreateOnce(paths.envPath, renderRuntimeEnv({
    state,
    postgresPassword: secret(),
    chatv3ServerKey: secret(),
    port,
  }), 0o600)
  writeCreateOnce(paths.ledgerPath, '[]\n', 0o600)
  writeCreateOnce(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, 0o600)
  return { status: 'created', paths, state }
}

function readLedger(paths: CommunityInstallPaths): CommunityUpdateRecord[] {
  const value = parseJsonFile(paths.ledgerPath)
  if (!Array.isArray(value)) throw new Error('community_update_ledger_invalid')
  return value as CommunityUpdateRecord[]
}

function writeLedger(paths: CommunityInstallPaths, records: CommunityUpdateRecord[]): void {
  atomicWrite(paths.ledgerPath, `${JSON.stringify(records, null, 2)}\n`, 0o600)
}

function persistState(paths: CommunityInstallPaths, state: CommunityInstallState): void {
  atomicWrite(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, 0o600)
}

export async function verifyCommunityBackupRecord(record: CommunityBackupRecord): Promise<void> {
  if (!record || typeof record !== 'object' || typeof record.path !== 'string' ||
      record.verified !== true || !path.isAbsolute(record.path) || !existsSync(record.path)) {
    throw new Error('community_backup_verification_required')
  }
  const stat = statSync(record.path)
  if (!stat.isFile() || stat.size <= 0 || stat.size !== record.byteLength) {
    throw new Error('community_backup_file_invalid')
  }
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(record.path)) hash.update(chunk)
  if (`sha256:${hash.digest('hex')}` !== record.sha256) {
    throw new Error('community_backup_digest_mismatch')
  }
  assertInstalledRelease(record.sourceRelease)
}

export function writeCommunityBackupReceipt(paths: CommunityInstallPaths, record: CommunityBackupRecord): string {
  if (!isWithin(paths.backupRoot, record.path)) throw new Error('community_backup_outside_instance')
  const receiptPath = `${record.path}.json`
  if (existsSync(receiptPath)) throw new Error('community_backup_receipt_already_exists')
  writeCreateOnce(receiptPath, `${JSON.stringify(record, null, 2)}\n`, 0o600)
  return receiptPath
}

export async function readCommunityBackupReceipt(
  paths: CommunityInstallPaths,
  backupPath: string,
): Promise<CommunityBackupRecord> {
  const absolute = assertAbsolute(backupPath, 'community_backup_absolute_path_required')
  if (!isWithin(paths.backupRoot, absolute)) throw new Error('community_backup_outside_instance')
  const record = parseJsonFile(`${absolute}.json`) as CommunityBackupRecord
  if (!record || typeof record !== 'object' || typeof record.path !== 'string') {
    throw new Error('community_backup_receipt_invalid')
  }
  if (path.resolve(record.path) !== absolute) throw new Error('community_backup_receipt_path_mismatch')
  await verifyCommunityBackupRecord(record)
  return record
}

export async function restoreCommunityBackup(options: {
  paths: CommunityInstallPaths
  backup: CommunityBackupRecord
  adapter: CommunityLifecycleAdapter
  confirmDataRewind: boolean
  now?: () => Date
  createId?: () => string
}): Promise<{ status: 'restored'; backup: CommunityBackupRecord; replacementVolumeName: string }> {
  if (options.confirmDataRewind !== true) throw new Error('community_restore_data_rewind_confirmation_required')
  const state = readCommunityInstallState(options.paths)
  await verifyCommunityBackupRecord(options.backup)
  if (!isWithin(options.paths.backupRoot, options.backup.path)) throw new Error('community_backup_outside_instance')
  if (options.backup.sourceRelease.imageRef !== state.activeRelease.imageRef) {
    throw new Error('community_restore_source_release_mismatch')
  }
  await options.adapter.verifyRelease(state.activeRelease)
  const suffix = (options.createId ?? randomUUID)().replace(/-/g, '').slice(0, 12)
  const replacementVolumeName = `${state.composeProjectName}-pg-restore-${suffix}`
  await options.adapter.stop({ paths: options.paths, state })
  await options.adapter.restoreBackup({
    paths: options.paths,
    state,
    backup: options.backup,
    postgresVolumeName: replacementVolumeName,
  })
  await options.adapter.pull({ paths: options.paths, state, release: state.activeRelease })
  await options.adapter.start({
    paths: options.paths,
    state,
    release: state.activeRelease,
    postgresVolumeName: replacementVolumeName,
  })
  const validationState = { ...state, postgresVolumeName: replacementVolumeName }
  await options.adapter.health({ paths: options.paths, state: validationState })
  await options.adapter.dataSmoke({ paths: options.paths, state: validationState })
  state.postgresVolumeName = replacementVolumeName
  state.updatedAt = nowIso(options.now ?? (() => new Date()))
  updateRuntimeEnvBindings(options.paths, state)
  persistState(options.paths, state)
  return { status: 'restored', backup: options.backup, replacementVolumeName }
}

export function buildCommunityComposeInvocation(params: {
  paths: CommunityInstallPaths
  state: CommunityInstallState
  action: 'pull' | 'up' | 'down' | 'stop' | 'restart' | 'status' | 'logs'
  release?: CommunityInstalledRelease
  postgresVolumeName?: string
  logsTail?: number
}): CommunityComposeInvocation {
  const release = params.release ?? params.state.activeRelease
  assertInstalledRelease(release)
  const prefix = buildCommunityComposeBaseInvocation({
    paths: params.paths,
    state: params.state,
    release,
    postgresVolumeName: params.postgresVolumeName,
  })
  const actionArgs: Record<typeof params.action, string[]> = {
    pull: ['pull'],
    up: ['up', '--no-build', '--detach', '--wait'],
    down: ['down'],
    stop: ['stop'],
    restart: ['restart'],
    status: ['ps'],
    logs: ['logs', '--tail', String(params.logsTail ?? 100)],
  }
  return { ...prefix, args: [...prefix.args, ...actionArgs[params.action]] }
}

export function buildCommunityComposeBaseInvocation(params: {
  paths: CommunityInstallPaths
  state: CommunityInstallState
  release?: CommunityInstalledRelease
  postgresVolumeName?: string
}): CommunityComposeInvocation {
  const release = params.release ?? params.state.activeRelease
  assertInstalledRelease(release)
  const args = [
    'compose',
    '--project-name', params.state.composeProjectName,
    '--env-file', params.paths.envPath,
    '--file', release.composePath,
  ]
  return {
    command: 'docker',
    args,
    env: {
      AOPS_IMAGE_REF: release.imageRef,
      AOPS_POSTGRES_VOLUME_NAME: params.postgresVolumeName ?? params.state.postgresVolumeName,
      COMPOSE_PROJECT_NAME: params.state.composeProjectName,
    },
  }
}

export async function updateCommunityInstall(options: {
  paths: CommunityInstallPaths
  targetRelease: CommunityInstalledRelease
  adapter: CommunityLifecycleAdapter
  now?: () => Date
  createId?: () => string
}): Promise<CommunityUpdateRecord> {
  const now = options.now ?? (() => new Date())
  const state = readCommunityInstallState(options.paths)
  assertInstalledRelease(options.targetRelease)
  await options.adapter.verifyRelease(options.targetRelease)
  const backup = await options.adapter.createBackup({ paths: options.paths, state })
  await verifyCommunityBackupRecord(backup)
  if (!isWithin(options.paths.backupRoot, backup.path)) {
    throw new Error('community_backup_outside_instance')
  }
  if (backup.sourceRelease.manifestSha256 !== state.activeRelease.manifestSha256) {
    throw new Error('community_backup_source_release_mismatch')
  }
  const record: CommunityUpdateRecord = {
    id: (options.createId ?? randomUUID)(),
    status: 'started',
    startedAt: nowIso(now),
    priorRelease: state.activeRelease,
    targetRelease: options.targetRelease,
    backup,
  }
  const ledger = readLedger(options.paths)
  writeLedger(options.paths, [...ledger, record])
  let migrationMayHaveStarted = false
  try {
    await options.adapter.stop({ paths: options.paths, state })
    await options.adapter.pull({ paths: options.paths, state, release: options.targetRelease })
    migrationMayHaveStarted = true
    await options.adapter.start({
      paths: options.paths,
      state,
      release: options.targetRelease,
      postgresVolumeName: state.postgresVolumeName,
    })
    await options.adapter.health({ paths: options.paths, state })
    await options.adapter.dataSmoke({ paths: options.paths, state })
    record.status = 'succeeded'
    record.finishedAt = nowIso(now)
    const nextState: CommunityInstallState = {
      ...state,
      updatedAt: record.finishedAt,
      activeRelease: options.targetRelease,
      previousRelease: state.activeRelease,
      lastSuccessfulUpdateId: record.id,
    }
    updateRuntimeEnvBindings(options.paths, nextState)
    persistState(options.paths, nextState)
    writeLedger(options.paths, [...ledger, record])
    return record
  } catch (error) {
    record.status = 'failed'
    record.finishedAt = nowIso(now)
    record.failure = error instanceof Error ? error.message : String(error)
    record.migrationMayHaveStarted = migrationMayHaveStarted
    writeLedger(options.paths, [...ledger, record])
    const suffix = migrationMayHaveStarted ? 'restore_from_backup_required' : 'pre_migration_failure'
    throw new Error(`community_update_failed:${suffix}:${record.failure}`, { cause: error })
  }
}

export async function rollbackCommunityInstall(options: {
  paths: CommunityInstallPaths
  adapter: CommunityLifecycleAdapter
  confirmDataRewind: boolean
  now?: () => Date
  createId?: () => string
}): Promise<CommunityUpdateRecord> {
  if (options.confirmDataRewind !== true) throw new Error('community_rollback_data_rewind_confirmation_required')
  const now = options.now ?? (() => new Date())
  const state = readCommunityInstallState(options.paths)
  if (!state.previousRelease || !state.lastSuccessfulUpdateId) {
    throw new Error('community_rollback_prior_release_missing')
  }
  const ledger = readLedger(options.paths)
  const update = ledger.find((entry) => entry.id === state.lastSuccessfulUpdateId && entry.status === 'succeeded')
  if (!update) throw new Error('community_rollback_update_record_missing')
  await verifyCommunityBackupRecord(update.backup)
  if (!isWithin(options.paths.backupRoot, update.backup.path)) {
    throw new Error('community_backup_outside_instance')
  }
  if (update.priorRelease.manifestSha256 !== state.previousRelease.manifestSha256) {
    throw new Error('community_rollback_prior_release_mismatch')
  }
  const replacementSuffix = (options.createId ?? randomUUID)().replace(/-/g, '').slice(0, 12)
  const replacementVolumeName = `${state.composeProjectName}-pg-rollback-${replacementSuffix}`
  await options.adapter.verifyRelease(state.previousRelease)
  await options.adapter.stop({ paths: options.paths, state })
  await options.adapter.restoreBackup({
    paths: options.paths,
    state,
    backup: update.backup,
    postgresVolumeName: replacementVolumeName,
  })
  await options.adapter.pull({ paths: options.paths, state, release: state.previousRelease })
  await options.adapter.start({
    paths: options.paths,
    state,
    release: state.previousRelease,
    postgresVolumeName: replacementVolumeName,
  })
  const validationState = {
    ...state,
    activeRelease: state.previousRelease,
    postgresVolumeName: replacementVolumeName,
  }
  await options.adapter.health({ paths: options.paths, state: validationState })
  await options.adapter.dataSmoke({ paths: options.paths, state: validationState })
  const finishedAt = nowIso(now)
  const rollbackRecord: CommunityUpdateRecord = {
    ...update,
    id: (options.createId ?? randomUUID)(),
    status: 'rolled-back',
    startedAt: finishedAt,
    finishedAt,
    replacementVolumeName,
  }
  const nextState: CommunityInstallState = {
    ...state,
    postgresVolumeName: replacementVolumeName,
    updatedAt: finishedAt,
    activeRelease: state.previousRelease,
    previousRelease: state.activeRelease,
    lastSuccessfulUpdateId: null,
  }
  updateRuntimeEnvBindings(options.paths, nextState)
  persistState(options.paths, nextState)
  writeLedger(options.paths, [...ledger, rollbackRecord])
  return rollbackRecord
}

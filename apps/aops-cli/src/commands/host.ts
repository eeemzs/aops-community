import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Command } from 'commander'
import { banner, logError, logInfo, logSuccess } from '@aopslab/xf-cli-ui'
import {
  getHostRegistrationsDir,
  listInstalledHostRegistrations,
  loadHostRegistrationFromCommand,
  loadHostRegistrationFromSpecifier,
  mergeHostRegistrationsIntoConfig,
  unregisterHostRegistration,
  writeHostRegistration,
} from '@aops/host-registration'
import {
  getAopsServerEnvPath,
  inferAopsRepoDialect,
  readAopsServerEnvConfig,
  writeAopsServerEnvConfig,
  type AopsHostLogLevel,
} from '@aops/runtime-config'

import { createCliApiClientFromOptions, fetchCliHealth } from '../utils/api.js'
import { applyCommonOptions, compactPayload, type CommonOptions } from '../utils/command.js'
import { ensureDestructiveWrite } from '../utils/hosted-sugar.js'
import { parseJsonInput, requireApiState } from '../utils/agent-gateway.js'

type HostHealthOptions = CommonOptions

type HostDiagnosticsOptions = CommonOptions & {
  reset?: boolean
  warmup?: boolean
}

type HostRegistrationOptions = CommonOptions & {
  registrationsDir?: string
}

type HostRegisterOptions = HostRegistrationOptions & {
  from?: string
  fromCommand?: string
}

type HostUnregisterOptions = HostRegistrationOptions & {
  domain?: string
}

type HostExplainRegistrationOptions = HostRegistrationOptions & {
  domain?: string
}

type HostConfigOptions = CommonOptions & {
  envPath?: string
}

type HostConfigSetOptions = HostConfigOptions & {
  repoUrl?: string
  logLevel?: string
}

type HostDatabaseStatusOptions = CommonOptions

type HostDatabaseResetMode = 'drop-only' | 'drop-and-recreate'

type HostDatabaseResetOptions = CommonOptions & {
  mode?: string
  includeAuthTables?: boolean
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  confirmText?: string
}

type HostDatabaseBackupExportOptions = CommonOptions & {
  includeAuthTables?: boolean
  table?: string[]
  output?: string
}

type HostDatabaseBackupRestoreMode = 'truncate-and-insert' | 'insert-only'

type HostDatabaseBackupRestoreOptions = CommonOptions & {
  input?: string
  inputJson?: string
  mode?: string
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  confirmText?: string
}

type HostDatabaseDumpOptions = CommonOptions & {
  envPath?: string
  repoUrl?: string
  pgBinDir?: string
  table?: string[]
  schemaOnly?: boolean
  dataOnly?: boolean
}

type HostDatabaseDumpExportOptions = HostDatabaseDumpOptions & {
  output?: string
}

type HostDatabaseDumpRestoreOptions = HostDatabaseDumpOptions & {
  input?: string
  clean?: boolean
  preview?: boolean
  apply?: boolean
  confirm?: boolean
}

const HOST_LOG_LEVELS: AopsHostLogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal']
const HOST_DATABASE_RESET_CONFIRM_TEXT = 'I understand all data will be lost'

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function expandHomePath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  if (trimmed === '~') return os.homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2))
  }
  return trimmed
}

function resolveHostEnvPath(options: HostConfigOptions): string {
  const envPath = normalizeNonEmpty(options.envPath)
  if (!envPath) return getAopsServerEnvPath(process.env)
  return path.resolve(process.cwd(), expandHomePath(envPath))
}

function normalizeHostLogLevel(value: unknown): AopsHostLogLevel | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  if ((HOST_LOG_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as AopsHostLogLevel
  }
  return undefined
}

function printHostConfigResult(payload: unknown, options: HostConfigOptions): void {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }
  console.log(JSON.stringify(payload, null, 2))
}

function printHostDatabaseResult(
  payload: unknown,
  options: { json?: boolean },
): void {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }
  console.log(JSON.stringify(payload, null, 2))
}

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function toNonEmptyStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .map((entry) => normalizeNonEmpty(entry))
    .filter((entry): entry is string => Boolean(entry))
  return normalized.length > 0 ? normalized : undefined
}

function normalizeHostDatabaseResetMode(value: unknown): HostDatabaseResetMode | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'drop-only') return 'drop-only'
  if (normalized === 'drop-and-recreate') return 'drop-and-recreate'
  return undefined
}

function buildHostDatabaseResetInput(
  options: HostDatabaseResetOptions,
): Record<string, unknown> {
  const mode = normalizeHostDatabaseResetMode(options.mode)
  if (options.mode && !mode) {
    throw new Error('Invalid --mode. Use one of: drop-only, drop-and-recreate')
  }

  return compactPayload({
    confirmText:
      normalizeNonEmpty(options.confirmText) ??
      HOST_DATABASE_RESET_CONFIRM_TEXT,
    mode,
    includeAuthTables: options.includeAuthTables === true,
  })
}

function normalizeHostDatabaseBackupRestoreMode(
  value: unknown,
): HostDatabaseBackupRestoreMode | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'truncate-and-insert') return 'truncate-and-insert'
  if (normalized === 'insert-only') return 'insert-only'
  return undefined
}

function resolveHostOutputPath(value: unknown): string | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  return path.resolve(process.cwd(), normalized)
}

function buildHostDatabaseBackupExportInput(
  options: HostDatabaseBackupExportOptions,
): Record<string, unknown> {
  return compactPayload({
    includeAuthTables: options.includeAuthTables === true,
    tables: toNonEmptyStringArray(options.table),
  })
}

function resolveBackupPayloadFromInput(options: {
  input?: string
  inputJson?: string
}): unknown {
  const inputPath = normalizeNonEmpty(options.input)
  const inputJson = normalizeNonEmpty(options.inputJson)

  if (inputPath && inputJson) {
    throw new Error('Provide only one of --input or --input-json.')
  }

  if (inputPath) {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), inputPath), 'utf8'))
  }

  if (inputJson) {
    return parseJsonInput(inputJson, '--input-json')
  }

  throw new Error('Missing backup input. Use --input or --input-json.')
}

function buildHostDatabaseBackupRestoreInput(
  options: HostDatabaseBackupRestoreOptions,
): Record<string, unknown> {
  const mode = normalizeHostDatabaseBackupRestoreMode(options.mode)
  if (options.mode && !mode) {
    throw new Error('Invalid --mode. Use one of: truncate-and-insert, insert-only')
  }

  return compactPayload({
    confirmText:
      normalizeNonEmpty(options.confirmText) ??
      HOST_DATABASE_RESET_CONFIRM_TEXT,
    mode,
    backup: resolveBackupPayloadFromInput(options),
  })
}

type NativePgProcessResult = {
  exitCode: number | null
  signal: NodeJS.Signals | null
}

type NativePgInvocation = {
  tool: string
  args: string[]
  redactedArgs: string[]
  repoUrl: string
  redactedRepoUrl: string
  repoUrlSource: 'option' | 'host-env'
  envPath: string | null
}

export const nativePgCommandRuntime = {
  async runProcess(tool: string, args: string[]): Promise<NativePgProcessResult> {
    return await new Promise<NativePgProcessResult>((resolve, reject) => {
      const child = spawn(tool, args, {
        stdio: 'inherit',
        shell: false,
      })

      child.on('error', (error) => reject(error))
      child.on('close', (exitCode, signal) => {
        resolve({
          exitCode,
          signal,
        })
      })
    })
  },
}

function resolvePgBinDir(value: unknown): string | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  return path.resolve(process.cwd(), expandHomePath(normalized))
}

function resolveNativePgToolCommand(tool: 'pg_dump' | 'pg_restore', pgBinDir?: string): string {
  if (!pgBinDir) return tool
  const executable = process.platform === 'win32' ? `${tool}.exe` : tool
  return path.join(pgBinDir, executable)
}

function redactPgUrl(connectionString: string): string {
  try {
    const parsed = new URL(connectionString)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '<invalid_pg_url>'
  }
}

function redactNativePgArgs(args: string[], redactedRepoUrl: string): string[] {
  return args.map((arg) => {
    if (arg.startsWith('--dbname=')) return `--dbname=${redactedRepoUrl}`
    return arg
  })
}

function resolveHostPgRepoTarget(options: {
  repoUrl?: unknown
  envPath?: unknown
}): {
  repoUrl: string
  redactedRepoUrl: string
  repoUrlSource: 'option' | 'host-env'
  envPath: string | null
} {
  const explicitRepoUrl = normalizeNonEmpty(options.repoUrl)
  if (explicitRepoUrl) {
    if (inferAopsRepoDialect(explicitRepoUrl) !== 'pg') {
      throw new Error('PG-native dump commands require a PostgreSQL repo URL.')
    }
    return {
      repoUrl: explicitRepoUrl,
      redactedRepoUrl: redactPgUrl(explicitRepoUrl),
      repoUrlSource: 'option',
      envPath: null,
    }
  }

  const envPath = normalizeNonEmpty(options.envPath)
    ? path.resolve(process.cwd(), expandHomePath(String(options.envPath)))
    : undefined
  const hostEnv = readAopsServerEnvConfig(process.env, envPath)
  if (!hostEnv.repoUrl) {
    throw new Error(
      'Missing PostgreSQL repo URL. Use --repo-url or configure host env with `aops-cli host config set --repo-url <postgresql://...>`.',
    )
  }
  if (hostEnv.repoDialect !== 'pg') {
    throw new Error('PG-native dump commands require the configured host repo URL to be PostgreSQL.')
  }

  return {
    repoUrl: hostEnv.repoUrl,
    redactedRepoUrl: hostEnv.redactedRepoUrl ?? redactPgUrl(hostEnv.repoUrl),
    repoUrlSource: 'host-env',
    envPath: hostEnv.path,
  }
}

function assertMutuallyExclusiveDataShape(options: {
  schemaOnly?: boolean
  dataOnly?: boolean
}): void {
  if (options.schemaOnly === true && options.dataOnly === true) {
    throw new Error('Use only one of --schema-only or --data-only.')
  }
}

function buildHostDatabaseDumpExportInvocation(
  options: HostDatabaseDumpExportOptions,
): NativePgInvocation & { outputPath: string } {
  assertMutuallyExclusiveDataShape(options)

  const outputPath = resolveHostOutputPath(options.output)
  if (!outputPath) {
    throw new Error('Missing --output. PG-native dump export writes a .dump file to disk.')
  }

  const pgBinDir = resolvePgBinDir(options.pgBinDir)
  const repoTarget = resolveHostPgRepoTarget(options)
  const args = [
    `--dbname=${repoTarget.repoUrl}`,
    '--format=custom',
    '--file',
    outputPath,
    '--no-owner',
    '--no-privileges',
  ]

  if (options.schemaOnly === true) args.push('--schema-only')
  if (options.dataOnly === true) args.push('--data-only')
  for (const tableName of toNonEmptyStringArray(options.table) ?? []) {
    args.push('--table', tableName)
  }

  return {
    ...repoTarget,
    tool: resolveNativePgToolCommand('pg_dump', pgBinDir),
    args,
    redactedArgs: redactNativePgArgs(args, repoTarget.redactedRepoUrl),
    outputPath,
  }
}

function buildHostDatabaseDumpRestoreInvocation(
  options: HostDatabaseDumpRestoreOptions,
): NativePgInvocation & { inputPath: string } {
  assertMutuallyExclusiveDataShape(options)

  const inputPath = resolveHostOutputPath(options.input)
  if (!inputPath) {
    throw new Error('Missing --input. PG-native dump restore requires a dump file path.')
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Dump input not found: ${inputPath}`)
  }

  const pgBinDir = resolvePgBinDir(options.pgBinDir)
  const repoTarget = resolveHostPgRepoTarget(options)
  const args = [
    `--dbname=${repoTarget.repoUrl}`,
    '--no-owner',
    '--no-privileges',
  ]

  if (options.clean === true) {
    args.push('--clean', '--if-exists')
  }
  if (options.schemaOnly === true) args.push('--schema-only')
  if (options.dataOnly === true) args.push('--data-only')
  for (const tableName of toNonEmptyStringArray(options.table) ?? []) {
    args.push('--table', tableName)
  }
  args.push(inputPath)

  return {
    ...repoTarget,
    tool: resolveNativePgToolCommand('pg_restore', pgBinDir),
    args,
    redactedArgs: redactNativePgArgs(args, repoTarget.redactedRepoUrl),
    inputPath,
  }
}

function formatNativePgRunnerError(error: unknown, tool: string): string {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    return `Required PostgreSQL client tool not found: ${tool}. Install PostgreSQL client tools or pass --pg-bin-dir.`
  }
  return error instanceof Error ? error.message : String(error)
}

function resolveWarmupTimeoutMs(options: HostDiagnosticsOptions, shouldWarmup: boolean, shouldReset: boolean): number | undefined {
  if (typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    return options.timeoutMs
  }
  if (shouldWarmup || shouldReset) return 120_000
  return options.timeoutMs
}

function buildHostDiagnosticsPath(options: HostDiagnosticsOptions): string {
  const query = new URLSearchParams()
  if (options.reset === true) query.set('reset', '1')
  if (options.warmup === true) query.set('warmup', '1')
  const search = query.toString()
  return search ? `/api/host-admin/plugins?${search}` : '/api/host-admin/plugins'
}

function applyHostRegistrationOptions<T extends Command>(cmd: T): T {
  return cmd.option(
    '--registrations-dir <path>',
    'Host registrations directory (default: AOPS_HOST_REGISTRATIONS_DIR or ~/.aops/host-registrations)',
  ) as T
}

function resolveHostRegistrationsDir(options: HostRegistrationOptions): string {
  return getHostRegistrationsDir({
    registrationsDir: options.registrationsDir,
    processEnv: process.env,
  })
}

function printHostRegistrationResult(payload: unknown, options: HostRegistrationOptions): void {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }
  console.log(JSON.stringify(payload, null, 2))
}

function requireSingleRegistrationSource(options: HostRegisterOptions): { kind: 'specifier' | 'command'; value: string } {
  const from = options.from?.trim()
  const fromCommand = options.fromCommand?.trim()

  if (from && fromCommand) {
    throw new Error('Provide only one of --from or --from-command.')
  }
  if (from) return { kind: 'specifier', value: from }
  if (fromCommand) return { kind: 'command', value: fromCommand }
  throw new Error('Missing registration source. Use --from or --from-command.')
}

export async function runHostRegister(options: HostRegisterOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const source = requireSingleRegistrationSource(options)
  const registrationsDir = resolveHostRegistrationsDir(options)

  if (interactive) {
    banner('AOPS Host Register')
    logInfo(`Registry: ${registrationsDir}`)
    logInfo(`Source: ${source.value}`)
  }

  try {
    const manifest =
      source.kind === 'command'
        ? await loadHostRegistrationFromCommand(source.value, { cwd: process.cwd(), processEnv: process.env })
        : await loadHostRegistrationFromSpecifier(source.value, { cwd: process.cwd(), processEnv: process.env })
    const filePath = writeHostRegistration(manifest, {
      registrationsDir,
      processEnv: process.env,
    })

    if (!options.json) logSuccess(`Registered ${manifest.domain}.`)
    printHostRegistrationResult(
      {
        ok: true,
        domain: manifest.domain,
        displayName: manifest.displayName ?? null,
        packageName: manifest.packageName ?? null,
        filePath,
        registrationsDir,
        manifest,
      },
      options,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Registration failed: ${message}`)
    process.exitCode = 1
  }
}

export async function runHostRegistrations(options: HostRegistrationOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const registrationsDir = resolveHostRegistrationsDir(options)

  if (interactive) {
    banner('AOPS Host Registrations')
    logInfo(`Registry: ${registrationsDir}`)
  }

  try {
    const registrations = listInstalledHostRegistrations({
      registrationsDir,
      processEnv: process.env,
    })

    if (!options.json) logSuccess(`Loaded ${registrations.length} registration(s).`)
    printHostRegistrationResult(
      {
        ok: true,
        registrationsDir,
        count: registrations.length,
        registrations: registrations.map((entry) => ({
          domain: entry.domain,
          filePath: entry.filePath,
          displayName: entry.manifest.displayName ?? null,
          packageName: entry.manifest.packageName ?? null,
          description: entry.manifest.description ?? null,
          manifestProviderCount: entry.manifest.manifestProviders?.length ?? 0,
          pluginCount: entry.manifest.plugins?.length ?? 0,
          sourceCount: entry.manifest.sources?.length ?? 0,
        })),
      },
      options,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to load registrations: ${message}`)
    process.exitCode = 1
  }
}

export async function runHostUnregister(options: HostUnregisterOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const domain = options.domain?.trim().toLowerCase()
  if (!domain) {
    logError('Missing --domain.')
    process.exitCode = 1
    return
  }
  const registrationsDir = resolveHostRegistrationsDir(options)

  if (interactive) {
    banner('AOPS Host Unregister')
    logInfo(`Registry: ${registrationsDir}`)
    logInfo(`Domain: ${domain}`)
  }

  const removed = unregisterHostRegistration(domain, {
    registrationsDir,
    processEnv: process.env,
  })

  if (!removed) {
    logError(`Registration not found: ${domain}`)
    process.exitCode = 1
    return
  }

  if (!options.json) logSuccess(`Unregistered ${domain}.`)
  printHostRegistrationResult(
    {
      ok: true,
      domain,
      registrationsDir,
      removed: true,
    },
    options,
  )
}

export async function runHostExplainRegistration(
  options: HostExplainRegistrationOptions = {},
): Promise<void> {
  const interactive = !options.yes && !options.json
  const domain = options.domain?.trim().toLowerCase()
  if (!domain) {
    logError('Missing --domain.')
    process.exitCode = 1
    return
  }

  const registrationsDir = resolveHostRegistrationsDir(options)
  const registrations = listInstalledHostRegistrations({
    registrationsDir,
    processEnv: process.env,
  })
  const entry = registrations.find((item) => item.domain === domain)

  if (!entry) {
    logError(`Registration not found: ${domain}`)
    process.exitCode = 1
    return
  }

  if (interactive) {
    banner('AOPS Host Registration')
    logInfo(`Registry: ${registrationsDir}`)
    logInfo(`Domain: ${domain}`)
  }

  const projected = mergeHostRegistrationsIntoConfig({}, [entry.manifest])
  if (!options.json) logSuccess(`Explained ${domain} registration.`)
  printHostRegistrationResult(
    {
      ok: true,
      registrationsDir,
      filePath: entry.filePath,
      manifest: entry.manifest,
      projectedConfig: projected,
    },
    options,
  )
}

export async function runHostHealth(options: HostHealthOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await createCliApiClientFromOptions(options)

  if (interactive) {
    banner('AOPS Host Health')
    logInfo(`API: ${apiState.baseUrl}`)
  }

  try {
    const payload = await fetchCliHealth(apiState, { timeoutMs: options.timeoutMs })

    if (!options.json) logSuccess('Host is healthy.')
    console.log(JSON.stringify(payload, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Health check failed: ${message}`)
    process.exitCode = 1
  }
}

export async function runHostConfigShow(options: HostConfigOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const envPath = resolveHostEnvPath(options)
  const snapshot = readAopsServerEnvConfig(process.env, envPath)

  if (interactive) {
    banner('AOPS Host Config')
    logInfo(`Host env: ${snapshot.path}`)
  }

  if (!options.json) {
    logSuccess(snapshot.exists ? 'Loaded local host env config.' : 'Local host env config is not created yet.')
  }
  printHostConfigResult(
    {
      ok: true,
      action: 'host.config.show',
      envPath: snapshot.path,
      exists: snapshot.exists,
      repoUrlPresent: Boolean(snapshot.repoUrl),
      repoDialect: snapshot.repoDialect,
      redactedRepoUrl: snapshot.redactedRepoUrl,
      logLevel: snapshot.hostSettings.logLevel,
      next: {
        setRepo: 'aops-cli host config set --repo-url <url>',
        setLogLevel: 'aops-cli host config set --log-level <level>',
      },
    },
    options,
  )
}

export async function runHostConfigSet(options: HostConfigSetOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const repoUrl = normalizeNonEmpty(options.repoUrl)
  const logLevel = normalizeHostLogLevel(options.logLevel)

  if (!repoUrl && options.logLevel && !logLevel) {
    logError(`Invalid --log-level. Use one of: ${HOST_LOG_LEVELS.join(', ')}`)
    process.exitCode = 1
    return
  }

  if (!repoUrl && !logLevel) {
    logError('Nothing to update. Provide --repo-url and/or --log-level.')
    process.exitCode = 1
    return
  }

  const envPath = resolveHostEnvPath(options)
  if (interactive) {
    banner('AOPS Host Config Set')
    logInfo(`Host env: ${envPath}`)
    if (repoUrl) logInfo(`Repo: ${repoUrl}`)
    if (logLevel) logInfo(`Log level: ${logLevel}`)
  }

  const written = writeAopsServerEnvConfig(
    {
      ...(repoUrl ? { repoUrl } : {}),
      ...(logLevel ? { logLevel } : {}),
    },
    process.env,
    envPath,
  )

  if (!options.json) {
    logSuccess('Updated local host env config. Restart aops-server to apply changes.')
  }
  printHostConfigResult(
    {
      ok: true,
      action: 'host.config.set',
      envPath: written.path,
      exists: written.exists,
      repoUrlPresent: Boolean(written.repoUrl),
      repoDialect: written.repoUrl ? inferAopsRepoDialect(written.repoUrl) : null,
      redactedRepoUrl: written.redactedRepoUrl,
      logLevel: written.hostSettings.logLevel,
      restartRequired: true,
    },
    options,
  )
}

export async function runHostDiagnostics(options: HostDiagnosticsOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await requireApiState(options)
  if (!apiState) return

  const shouldReset = options.reset === true
  const shouldWarmup = options.warmup === true
  const requestTimeoutMs = resolveWarmupTimeoutMs(options, shouldWarmup, shouldReset)
  const path = buildHostDiagnosticsPath(options)

  if (interactive) {
    banner('AOPS Host Diagnostics')
    logInfo(`API: ${apiState.baseUrl}`)
    if (shouldReset) logInfo('Reset: enabled')
    if (shouldWarmup) logInfo('Warmup: enabled')
    if (requestTimeoutMs && (shouldWarmup || shouldReset)) logInfo(`Timeout: ${requestTimeoutMs}ms`)
  }

  try {
    const payload = await apiState.client.fetchJson<unknown>(path, {
      method: 'GET',
      timeoutMs: requestTimeoutMs,
    })

    if (!options.json) logSuccess('Host diagnostics loaded.')
    console.log(JSON.stringify(payload, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to load host diagnostics: ${message}`)
    process.exitCode = 1
  }
}

export async function runHostDatabaseStatus(
  options: HostDatabaseStatusOptions = {},
): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await requireApiState(options)
  if (!apiState) return

  if (interactive) {
    banner('AOPS Host Database Status')
    logInfo(`API: ${apiState.baseUrl}`)
  }

  try {
    const payload = await apiState.client.fetchJson<unknown>(
      '/api/aops/settings/database/status',
      {
        method: 'GET',
        timeoutMs: options.timeoutMs,
      },
    )

    if (!options.json) logSuccess('Host database status loaded.')
    printHostDatabaseResult(payload, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to load host database status: ${message}`)
    process.exitCode = 1
  }
}

export async function runHostDatabaseReset(
  options: HostDatabaseResetOptions = {},
): Promise<void> {
  const interactive = !options.yes && !options.json

  try {
    ensureDestructiveWrite(
      {
        apply: options.apply,
        confirm: options.confirm,
        preview: options.preview,
      },
      'This command resets hosted database tables.',
    )
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  let input: Record<string, unknown>
  try {
    input = buildHostDatabaseResetInput(options)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  if (options.preview) {
    const payload = {
      ok: true,
      action: 'host.database.reset.preview',
      surface: '/api/aops/settings/database/reset',
      destructive: true,
      input,
      next: {
        apply:
          'aops-cli host database reset --mode drop-and-recreate --apply --confirm',
      },
    }
    if (!options.json) logSuccess('Host database reset preview ready.')
    printHostDatabaseResult(payload, options)
    return
  }

  const apiState = await requireApiState(options)
  if (!apiState) return

  if (interactive) {
    banner('AOPS Host Database Reset')
    logInfo(`API: ${apiState.baseUrl}`)
    logInfo(
      `Mode: ${String(input.mode ?? 'drop-only')}`,
    )
    if (input.includeAuthTables === true) {
      logInfo('Include auth tables: yes')
    }
  }

  try {
    const payload = await apiState.client.fetchJson<unknown>(
      '/api/aops/settings/database/reset',
      {
        method: 'POST',
        body: input,
        timeoutMs: options.timeoutMs,
      },
    )

    if (!options.json) logSuccess('Host database reset completed.')
    printHostDatabaseResult(payload, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Host database reset failed: ${message}`)
    process.exitCode = 1
  }
}

export async function runHostDatabaseBackupExport(
  options: HostDatabaseBackupExportOptions = {},
): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await requireApiState(options)
  if (!apiState) return

  const input = buildHostDatabaseBackupExportInput(options)
  const outputPath = resolveHostOutputPath(options.output)

  if (interactive) {
    banner('AOPS Host Database Backup Export')
    logInfo(`API: ${apiState.baseUrl}`)
    if (outputPath) logInfo(`Output: ${outputPath}`)
  }

  try {
    const payload = await apiState.client.fetchJson<Record<string, unknown>>(
      '/api/aops/settings/database/backup/export',
      {
        method: 'POST',
        body: input,
        timeoutMs: options.timeoutMs,
      },
    )

    const backup = payload?.data ?? payload
    if (outputPath) {
      fs.writeFileSync(outputPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8')
      const response = {
        ok: true,
        action: 'host.database.backup.export',
        outputPath,
        input,
      }
      if (!options.json) logSuccess('Host database backup exported.')
      printHostDatabaseResult(response, options)
      return
    }

    if (!options.json) logSuccess('Host database backup exported.')
    printHostDatabaseResult(backup, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Host database backup export failed: ${message}`)
    process.exitCode = 1
  }
}

export async function runHostDatabaseBackupRestore(
  options: HostDatabaseBackupRestoreOptions = {},
): Promise<void> {
  const interactive = !options.yes && !options.json

  try {
    ensureDestructiveWrite(
      {
        apply: options.apply,
        confirm: options.confirm,
        preview: options.preview,
      },
      'This command restores hosted database state.',
    )
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  let input: Record<string, unknown>
  try {
    input = buildHostDatabaseBackupRestoreInput(options)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  if (options.preview) {
    const payload = {
      ok: true,
      action: 'host.database.backup.restore.preview',
      surface: '/api/aops/settings/database/backup/restore',
      destructive: true,
      input,
      next: {
        apply:
          'aops-cli host database backup restore --input <backup.json> --apply --confirm',
      },
    }
    if (!options.json) logSuccess('Host database backup restore preview ready.')
    printHostDatabaseResult(payload, options)
    return
  }

  const apiState = await requireApiState(options)
  if (!apiState) return

  if (interactive) {
    banner('AOPS Host Database Backup Restore')
    logInfo(`API: ${apiState.baseUrl}`)
    logInfo(
      `Mode: ${String(input.mode ?? 'truncate-and-insert')}`,
    )
  }

  try {
    const payload = await apiState.client.fetchJson<unknown>(
      '/api/aops/settings/database/backup/restore',
      {
        method: 'POST',
        body: input,
        timeoutMs: options.timeoutMs,
      },
    )

    if (!options.json) logSuccess('Host database backup restore completed.')
    printHostDatabaseResult(payload, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Host database backup restore failed: ${message}`)
    process.exitCode = 1
  }
}

export async function runHostDatabaseDumpExport(
  options: HostDatabaseDumpExportOptions = {},
): Promise<void> {
  const interactive = !options.yes && !options.json

  let invocation: NativePgInvocation & { outputPath: string }
  try {
    invocation = buildHostDatabaseDumpExportInvocation(options)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  if (interactive) {
    banner('AOPS Host Database Dump Export')
    logInfo(`Repo: ${invocation.redactedRepoUrl}`)
    logInfo(`Output: ${invocation.outputPath}`)
    logInfo(`Tool: ${invocation.tool}`)
  }

  try {
    const result = await nativePgCommandRuntime.runProcess(invocation.tool, invocation.args)
    if (result.exitCode !== 0) {
      throw new Error(
        `${path.basename(invocation.tool)} exited with code ${String(result.exitCode ?? 'null')}.`,
      )
    }

    const payload = {
      ok: true,
      action: 'host.database.dump.export',
      format: 'pg-custom',
      tool: invocation.tool,
      args: invocation.redactedArgs,
      outputPath: invocation.outputPath,
      repoUrl: invocation.redactedRepoUrl,
      repoUrlSource: invocation.repoUrlSource,
      envPath: invocation.envPath,
    }
    if (!options.json) logSuccess('PG-native dump export completed.')
    printHostDatabaseResult(payload, options)
  } catch (error) {
    logError(`PG-native dump export failed: ${formatNativePgRunnerError(error, invocation.tool)}`)
    process.exitCode = 1
  }
}

export async function runHostDatabaseDumpRestore(
  options: HostDatabaseDumpRestoreOptions = {},
): Promise<void> {
  const interactive = !options.yes && !options.json

  try {
    ensureDestructiveWrite(
      {
        apply: options.apply,
        confirm: options.confirm,
        preview: options.preview,
      },
      'This command restores database state using pg_restore.',
    )
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  let invocation: NativePgInvocation & { inputPath: string }
  try {
    invocation = buildHostDatabaseDumpRestoreInvocation(options)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  if (options.preview) {
    const payload = {
      ok: true,
      action: 'host.database.dump.restore.preview',
      destructive: true,
      tool: invocation.tool,
      args: invocation.redactedArgs,
      inputPath: invocation.inputPath,
      repoUrl: invocation.redactedRepoUrl,
      repoUrlSource: invocation.repoUrlSource,
      envPath: invocation.envPath,
      next: {
        apply:
          'aops-cli host database dump restore --input <backup.dump> --apply --confirm',
      },
    }
    if (!options.json) logSuccess('PG-native dump restore preview ready.')
    printHostDatabaseResult(payload, options)
    return
  }

  if (interactive) {
    banner('AOPS Host Database Dump Restore')
    logInfo(`Repo: ${invocation.redactedRepoUrl}`)
    logInfo(`Input: ${invocation.inputPath}`)
    logInfo(`Tool: ${invocation.tool}`)
  }

  try {
    const result = await nativePgCommandRuntime.runProcess(invocation.tool, invocation.args)
    if (result.exitCode !== 0) {
      throw new Error(
        `${path.basename(invocation.tool)} exited with code ${String(result.exitCode ?? 'null')}.`,
      )
    }

    const payload = {
      ok: true,
      action: 'host.database.dump.restore',
      destructive: true,
      tool: invocation.tool,
      args: invocation.redactedArgs,
      inputPath: invocation.inputPath,
      repoUrl: invocation.redactedRepoUrl,
      repoUrlSource: invocation.repoUrlSource,
      envPath: invocation.envPath,
    }
    if (!options.json) logSuccess('PG-native dump restore completed.')
    printHostDatabaseResult(payload, options)
  } catch (error) {
    logError(`PG-native dump restore failed: ${formatNativePgRunnerError(error, invocation.tool)}`)
    process.exitCode = 1
  }
}

export async function runHostHello(options: CommonOptions = {}): Promise<void> {
  const apiState = await createCliApiClientFromOptions(options)

  try {
    const payload = await apiState.client.fetchJson<unknown>('/api/hello', {
      method: 'GET',
      auth: false,
      retry401: false,
      timeoutMs: options.timeoutMs,
    })
    console.log(JSON.stringify(payload, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Hello endpoint failed: ${message}`)
    process.exitCode = 1
  }
}

export function makeHostCommand(): Command {
  const cmd = new Command('host').description('Host inventory, registration, diagnostics, and admin commands')
  const configCmd = cmd.command('config').description('Inspect or update the local host-owned env config')
  const databaseCmd = cmd
    .command('database')
    .alias('db')
    .description('Inspect or mutate the active host database via AOPS db-admin routes')
  const backupCmd = databaseCmd
    .command('backup')
    .description('Export or restore hosted database backups')
  const dumpCmd = databaseCmd
    .command('dump')
    .description('Run PG-native pg_dump / pg_restore against the configured PostgreSQL repo URL')

  applyCommonOptions(
    configCmd
      .command('show')
      .description('Show repo target and host log level from the local host env file')
      .option('--env-path <path>', 'Explicit host env file path (default: ~/.aops/aops.server.env)')
      .action(async (options: HostConfigOptions) => {
        await runHostConfigShow(options)
      }),
    { withAuth: false, withProject: false },
  )

  applyCommonOptions(
    configCmd
      .command('set')
      .description('Write repo target and/or host log level into the local host env file')
      .option('--env-path <path>', 'Explicit host env file path (default: ~/.aops/aops.server.env)')
      .option('--repo-url <url>', 'Shared host repository URL')
      .option('--log-level <level>', `Host log level (${HOST_LOG_LEVELS.join(', ')})`)
      .action(async (options: HostConfigSetOptions) => {
        await runHostConfigSet(options)
      }),
    { withAuth: false, withProject: false },
  )

  applyHostRegistrationOptions(
    applyCommonOptions(
      cmd
        .command('register')
        .description('Install a host registration manifest into the operator registry')
        .option('--from <specifier>', 'Path or module specifier that exports a host registration manifest')
        .option('--from-command <command>', 'Shell command that prints a host registration manifest JSON document')
        .action(async (options: HostRegisterOptions) => {
          await runHostRegister(options)
        }),
      { withAuth: false, withProject: false },
    ),
  )

  applyHostRegistrationOptions(
    applyCommonOptions(
      cmd.command('registrations').description('List installed host registrations in the operator registry').action(async (options: HostRegistrationOptions) => {
        await runHostRegistrations(options)
      }),
      { withAuth: false, withProject: false },
    ),
  )

  applyHostRegistrationOptions(
    applyCommonOptions(
      cmd
        .command('unregister')
        .description('Remove an installed host registration')
        .requiredOption('--domain <domain>', 'Domain id')
        .action(async (options: HostUnregisterOptions) => {
          await runHostUnregister(options)
        }),
      { withAuth: false, withProject: false },
    ),
  )

  applyHostRegistrationOptions(
    applyCommonOptions(
      cmd
        .command('explain-registration')
        .description('Explain the stored registration manifest and projected host-config fragment')
        .requiredOption('--domain <domain>', 'Domain id')
        .action(async (options: HostExplainRegistrationOptions) => {
          await runHostExplainRegistration(options)
        }),
      { withAuth: false, withProject: false },
    ),
  )

  applyCommonOptions(
    cmd.command('health').description('Smoke the runtime health endpoint (GET /api/health)').action(async (options: HostHealthOptions) => {
      await runHostHealth(options)
    }),
    { withAuth: false, withProject: false }
  )

  applyCommonOptions(
    cmd
      .command('diagnostics')
      .alias('plugins')
      .description('Inspect host runtime diagnostics (/api/host-admin/plugins)')
      .option('--reset', 'Reset plugin registry and agent gateway catalog snapshot before diagnostics')
      .option('--warmup', 'Warmup plugin registry before diagnostics')
      .action(async (options: HostDiagnosticsOptions) => {
        await runHostDiagnostics(options)
      }),
    { withProject: false }
  )

  applyCommonOptions(
    databaseCmd
      .command('status')
      .description('Load hosted database status (/api/aops/settings/database/status)')
      .action(async (options: HostDatabaseStatusOptions) => {
        await runHostDatabaseStatus(options)
      }),
    { withProject: false, withYes: false },
  )

  applyCommonOptions(
    databaseCmd
      .command('reset')
      .description('Reset hosted database tables and optionally recreate schema')
      .option('--mode <mode>', 'Reset mode (drop-only or drop-and-recreate)')
      .option('--include-auth-tables', 'Also reset auth tables')
      .option('--preview', 'Show the reset payload without calling the server')
      .option('--apply', 'Execute the hosted database reset')
      .option('--confirm', 'Required with --apply because this command deletes hosted state')
      .option(
        '--confirm-text <text>',
        'Override the destructive confirmation text sent to the server',
      )
      .action(async (options: HostDatabaseResetOptions) => {
        await runHostDatabaseReset(options)
      }),
    { withProject: false, withYes: false },
  )

  applyCommonOptions(
    backupCmd
      .command('export')
      .description('Export a hosted database backup through the AOPS backup route')
      .option('--include-auth-tables', 'Also export auth tables')
      .option('--table <name>', 'Limit export to a configured table', collectRepeatedOption, [])
      .option('--output <path>', 'Write backup JSON to a file instead of stdout')
      .action(async (options: HostDatabaseBackupExportOptions) => {
        await runHostDatabaseBackupExport(options)
      }),
    { withProject: false, withYes: false },
  )

  applyCommonOptions(
    backupCmd
      .command('restore')
      .description('Restore a hosted database backup through the AOPS restore route')
      .option('--input <path>', 'Read backup JSON from a file')
      .option('--input-json <json>', 'Inline backup JSON or @file.json')
      .option('--mode <mode>', 'Restore mode (truncate-and-insert or insert-only)')
      .option('--preview', 'Show the restore payload without calling the server')
      .option('--apply', 'Execute the hosted backup restore')
      .option('--confirm', 'Required with --apply because this command mutates hosted state')
      .option(
        '--confirm-text <text>',
        'Override the destructive confirmation text sent to the server',
      )
      .action(async (options: HostDatabaseBackupRestoreOptions) => {
        await runHostDatabaseBackupRestore(options)
      }),
    { withProject: false, withYes: false },
  )

  applyCommonOptions(
    dumpCmd
      .command('export')
      .description('Write a native PostgreSQL custom dump file with pg_dump')
      .option('--env-path <path>', 'Path to host env file used to resolve repo URL')
      .option('--repo-url <url>', 'Override PostgreSQL repo URL instead of reading host env')
      .option('--pg-bin-dir <path>', 'Directory containing pg_dump / pg_restore executables')
      .requiredOption('--output <path>', 'Write dump output to this file path')
      .option('--table <name>', 'Limit dump to a table', collectRepeatedOption, [])
      .option('--schema-only', 'Dump schema only')
      .option('--data-only', 'Dump data only')
      .action(async (options: HostDatabaseDumpExportOptions) => {
        await runHostDatabaseDumpExport(options)
      }),
    { withProject: false, withYes: false },
  )

  applyCommonOptions(
    dumpCmd
      .command('restore')
      .description('Restore a native PostgreSQL custom dump file with pg_restore')
      .option('--env-path <path>', 'Path to host env file used to resolve repo URL')
      .option('--repo-url <url>', 'Override PostgreSQL repo URL instead of reading host env')
      .option('--pg-bin-dir <path>', 'Directory containing pg_dump / pg_restore executables')
      .requiredOption('--input <path>', 'Path to a native PostgreSQL dump file')
      .option('--table <name>', 'Restore only a table from the dump', collectRepeatedOption, [])
      .option('--schema-only', 'Restore schema only')
      .option('--data-only', 'Restore data only')
      .option('--clean', 'Drop database objects before recreating them')
      .option('--preview', 'Show the pg_restore invocation without executing it')
      .option('--apply', 'Execute pg_restore')
      .option('--confirm', 'Required with --apply because this command mutates database state')
      .action(async (options: HostDatabaseDumpRestoreOptions) => {
        await runHostDatabaseDumpRestore(options)
      }),
    { withProject: false, withYes: false },
  )

  applyCommonOptions(
    cmd.command('hello').description('Smoke the hello endpoint (GET /api/hello)').action(async (options: CommonOptions) => {
      await runHostHello(options)
    }),
    { withAuth: false, withProject: false }
  )

  cmd.addHelpText(
    'after',
    `
Examples:
  aops-cli host config show
  aops-cli host config set --repo-url file:~/.aops/aops.sqlite
  aops-cli host config set --repo-url postgresql://user:pass@host:5432/aops --log-level info
  aops-cli host database status
  aops-cli host database reset --mode drop-and-recreate --preview
  aops-cli host database reset --mode drop-and-recreate --include-auth-tables --apply --confirm
  aops-cli host database backup export --table prompts --table prompt-versions --output ./aops-backup.json
  aops-cli host database backup restore --input ./aops-backup.json --mode truncate-and-insert --apply --confirm
  aops-cli host database dump export --output ./aops.dump
  aops-cli host database dump restore --input ./aops.dump --preview
  aops-cli host database dump restore --input ./aops.dump --clean --apply --confirm
  aops-cli host register --from /path/to/host-registration.json
  aops-cli host register --from @scope/pkg/host-registration
  aops-cli host register --from-command 'fileman manifest host-registration --json'
  aops-cli host registrations
  aops-cli host explain-registration --domain fileman
  aops-cli host unregister --domain fileman
  aops-cli host health
  aops-cli host diagnostics --warmup
  aops-cli host diagnostics --reset --warmup
  aops-cli host hello
`
  )

  return cmd
}


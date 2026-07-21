import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import net from 'node:net'
import { userInfo } from 'node:os'

import { Client, type ClientConfig } from 'pg'

const POSTGRES_DOWNLOADS = 'https://www.postgresql.org/download/'
const POSTGRES_WINDOWS = 'https://www.postgresql.org/download/windows/'
const POSTGRES_MACOS = 'https://www.postgresql.org/download/macosx/'
const POSTGRES_LINUX = 'https://www.postgresql.org/download/linux/'
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/
const MINIMUM_POSTGRES_MAJOR = 17

export type LocalPostgresPlatform = 'windows' | 'macos' | 'linux'

export type LocalPostgresInstallGuidance = Readonly<{
  platform: LocalPostgresPlatform
  summary: string
  commands: readonly string[]
  url: string
}>

export type LocalPostgresInspection = Readonly<{
  schemaVersion: 1
  status: 'ready' | 'installed-not-running' | 'not-detected'
  host: string
  port: number
  reachable: boolean
  psqlAvailable: boolean
  psqlVersion: string | null
  guidance: LocalPostgresInstallGuidance
}>

export type InspectLocalPostgresOptions = Readonly<{
  host?: string
  port?: number
  timeoutMs?: number
  platform?: NodeJS.Platform
  commandAvailable?: (command: string) => boolean
  portProbe?: (host: string, port: number, timeoutMs: number) => Promise<boolean>
}>

export type ProvisionLocalPostgresOptions = Readonly<{
  host?: string
  port?: number
  adminUser?: string
  adminPassword?: string
  database?: string
  appUser?: string
  connectTimeoutMs?: number
}>

export type LocalPostgresProvisionResult = Readonly<{
  schemaVersion: 1
  status: 'provisioned'
  host: string
  port: number
  database: string
  appUser: string
  serverMajor: number
  connectionUrl: string
}>

type QueryResultLike = Readonly<{ rows: readonly Record<string, unknown>[] }>

export type LocalPostgresClient = Readonly<{
  connect: () => Promise<unknown>
  end: () => Promise<unknown>
  query: (text: string, values?: readonly unknown[]) => Promise<QueryResultLike>
}>

export type LocalPostgresProvisionDependencies = Readonly<{
  createClient?: (config: ClientConfig) => LocalPostgresClient
  createPassword?: () => string
}>

function normalizeLoopbackHost(value: unknown): string {
  const host = typeof value === 'string' ? value.trim().toLowerCase() : '127.0.0.1'
  const normalized = host.replace(/^\[|\]$/g, '')
  if (normalized === 'localhost' || normalized === '::1') return normalized
  const match = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized)
  if (match?.slice(1).every((octet) => Number(octet) <= 255)) return normalized
  throw new Error('setup_local_postgres_host_must_be_loopback')
}

function normalizePort(value: unknown): number {
  const port = Number(value ?? 5432)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('setup_local_postgres_port_invalid')
  }
  return port
}

function normalizeIdentifier(value: unknown, fallback: string, label: string): string {
  const normalized = (typeof value === 'string' ? value : fallback).trim().toLowerCase()
  if (!IDENTIFIER.test(normalized)) throw new Error(`setup_local_postgres_${label}_invalid`)
  return normalized
}

function commandAvailable(command: string): boolean {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which'
  return spawnSync(locator, [command], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 1_000,
    stdio: 'ignore',
  }).status === 0
}

function platformName(value: NodeJS.Platform): LocalPostgresPlatform {
  if (value === 'win32') return 'windows'
  if (value === 'darwin') return 'macos'
  return 'linux'
}

export function defaultLocalPostgresAdminUser(platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'darwin') return 'postgres'
  try {
    return normalizeIdentifier(userInfo().username, 'postgres', 'admin_user')
  } catch {
    return 'postgres'
  }
}

export function defaultLocalPostgresDatabase(instance: string | undefined): string {
  const normalized = String(instance ?? 'default').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
  return normalizeIdentifier(normalized === 'default' ? 'aops' : `aops_${normalized}`, 'aops', 'database')
}

export function localPostgresInstallGuidance(
  platform: NodeJS.Platform = process.platform,
  hasCommand: (command: string) => boolean = commandAvailable,
): LocalPostgresInstallGuidance {
  const resolved = platformName(platform)
  if (resolved === 'windows') {
    return Object.freeze({
      platform: resolved,
      summary: 'Install PostgreSQL 17 or newer with the official Windows installer, start its service, then retry path 3.',
      commands: Object.freeze([]),
      url: POSTGRES_WINDOWS,
    })
  }
  if (resolved === 'macos') {
    return Object.freeze({
      platform: resolved,
      summary: hasCommand('brew')
        ? 'Install and start PostgreSQL 17 with Homebrew, then retry path 3.'
        : 'Install PostgreSQL 17 or newer from an official macOS option, start it, then retry path 3.',
      commands: Object.freeze(hasCommand('brew')
        ? ['brew install postgresql@17', 'brew services start postgresql@17']
        : []),
      url: POSTGRES_MACOS,
    })
  }
  if (hasCommand('apt-get')) {
    return Object.freeze({
      platform: resolved,
      summary: 'Install PostgreSQL with the distribution package manager, start its service, then retry path 3.',
      commands: Object.freeze([
        'sudo apt-get update',
        'sudo apt-get install postgresql',
        'sudo systemctl enable --now postgresql',
      ]),
      url: POSTGRES_LINUX,
    })
  }
  if (hasCommand('dnf')) {
    return Object.freeze({
      platform: resolved,
      summary: 'Install, initialize, and start PostgreSQL with the distribution package manager, then retry path 3.',
      commands: Object.freeze([
        'sudo dnf install postgresql-server',
        'sudo postgresql-setup --initdb',
        'sudo systemctl enable --now postgresql.service',
      ]),
      url: POSTGRES_LINUX,
    })
  }
  return Object.freeze({
    platform: resolved,
    summary: 'Install PostgreSQL 17 or newer with the operating system package manager, start it, then retry path 3.',
    commands: Object.freeze([]),
    url: POSTGRES_DOWNLOADS,
  })
}

function localPostgresStartGuidance(
  platform: NodeJS.Platform,
  hasCommand: (command: string) => boolean,
): LocalPostgresInstallGuidance {
  const resolved = platformName(platform)
  if (resolved === 'windows') {
    return Object.freeze({
      platform: resolved,
      summary: 'PostgreSQL tools were found. Start the exact PostgreSQL service, confirm its loopback port, then retry path 3.',
      commands: Object.freeze([
        "Get-Service -Name 'postgresql*'",
        'Start-Service -Name <exact-service-name>',
      ]),
      url: POSTGRES_WINDOWS,
    })
  }
  if (resolved === 'macos' && hasCommand('brew')) {
    return Object.freeze({
      platform: resolved,
      summary: 'PostgreSQL tools were found. Start the Homebrew service or confirm the configured loopback port, then retry path 3.',
      commands: Object.freeze(['brew services start postgresql@17']),
      url: POSTGRES_MACOS,
    })
  }
  return Object.freeze({
    platform: resolved,
    summary: 'PostgreSQL tools were found. Start its service or confirm the configured loopback port, then retry path 3.',
    commands: Object.freeze(['sudo systemctl start postgresql']),
    url: resolved === 'macos' ? POSTGRES_MACOS : POSTGRES_LINUX,
  })
}

async function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    let settled = false
    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function readPsqlVersion(): string | null {
  const result = spawnSync('psql', ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 1_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0) return null
  const match = /psql\s+\(PostgreSQL\)\s+([^\s]+)/i.exec(String(result.stdout))
  return match?.[1] ?? null
}

export async function inspectLocalPostgres(
  options: InspectLocalPostgresOptions = {},
): Promise<LocalPostgresInspection> {
  const host = normalizeLoopbackHost(options.host)
  const port = normalizePort(options.port)
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs ?? 750), 100), 5_000)
  const hasCommand = options.commandAvailable ?? commandAvailable
  const psqlAvailable = hasCommand('psql')
  const reachable = await (options.portProbe ?? probePort)(host, port, timeoutMs)
  const guidance = !reachable && psqlAvailable
    ? localPostgresStartGuidance(options.platform ?? process.platform, hasCommand)
    : localPostgresInstallGuidance(options.platform, hasCommand)
  return Object.freeze({
    schemaVersion: 1,
    status: reachable ? 'ready' : psqlAvailable ? 'installed-not-running' : 'not-detected',
    host,
    port,
    reachable,
    psqlAvailable,
    psqlVersion: psqlAvailable && !options.commandAvailable ? readPsqlVersion() : null,
    guidance,
  })
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function generatedPassword(): string {
  return randomBytes(32).toString('base64url')
}

function safePgError(error: unknown): Error {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === '28P01') return new Error('setup_local_postgres_admin_auth_failed')
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') return new Error('setup_local_postgres_unreachable')
  if (code === '42501') return new Error('setup_local_postgres_admin_privileges_required')
  return new Error('setup_local_postgres_provision_failed')
}

export async function provisionLocalPostgres(
  options: ProvisionLocalPostgresOptions,
  dependencies: LocalPostgresProvisionDependencies = {},
): Promise<LocalPostgresProvisionResult> {
  const host = normalizeLoopbackHost(options.host)
  const port = normalizePort(options.port)
  const adminUser = normalizeIdentifier(options.adminUser, defaultLocalPostgresAdminUser(), 'admin_user')
  const database = normalizeIdentifier(options.database, 'aops', 'database')
  const appUser = normalizeIdentifier(options.appUser, database, 'app_user')
  if (adminUser === appUser) throw new Error('setup_local_postgres_admin_and_app_user_must_differ')
  const connectTimeoutMillis = Math.min(Math.max(Number(options.connectTimeoutMs ?? 5_000), 500), 30_000)
  const createClient = dependencies.createClient
    ?? ((config) => new Client(config) as unknown as LocalPostgresClient)
  const admin = createClient({
    host,
    port,
    user: adminUser,
    password: options.adminPassword || undefined,
    database: 'postgres',
    ssl: false,
    connectionTimeoutMillis: connectTimeoutMillis,
  })
  let createdRole = false
  let createdDatabase = false
  try {
    await admin.connect()
    const version = await admin.query('SHOW server_version_num')
    const versionNumber = Number(version.rows[0]?.server_version_num)
    const serverMajor = Math.floor(versionNumber / 10_000)
    if (!Number.isSafeInteger(serverMajor) || serverMajor < MINIMUM_POSTGRES_MAJOR) {
      throw new Error(`setup_local_postgres_version_unsupported:requires_${MINIMUM_POSTGRES_MAJOR}_or_newer`)
    }
    const privilege = await admin.query(
      'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user',
    )
    const role = privilege.rows[0]
    if (role?.rolsuper !== true && (role?.rolcreatedb !== true || role?.rolcreaterole !== true)) {
      throw new Error('setup_local_postgres_admin_privileges_required')
    }
    const existing = await admin.query(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS role_exists, EXISTS (SELECT 1 FROM pg_database WHERE datname = $2) AS database_exists',
      [appUser, database],
    )
    if (existing.rows[0]?.role_exists === true || existing.rows[0]?.database_exists === true) {
      throw new Error('setup_local_postgres_target_already_exists:choose_new_database_and_app_user')
    }
    const appPassword = (dependencies.createPassword ?? generatedPassword)()
    if (appPassword.length < 32 || /\0|\r|\n/.test(appPassword)) {
      throw new Error('setup_local_postgres_generated_password_invalid')
    }
    await admin.query(`CREATE ROLE ${quoteIdentifier(appUser)} LOGIN PASSWORD ${quoteLiteral(appPassword)}`)
    createdRole = true
    try {
      await admin.query(
        `CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(appUser)} TEMPLATE template0 ENCODING 'UTF8'`,
      )
      createdDatabase = true
    } catch (error) {
      try { await admin.query(`DROP ROLE ${quoteIdentifier(appUser)}`) } catch { /* preserve the original failure */ }
      createdRole = false
      throw error
    }
    const connection = new URL('postgresql://localhost/')
    connection.hostname = host === '::1' ? '[::1]' : host
    connection.port = String(port)
    connection.username = appUser
    connection.password = appPassword
    connection.pathname = `/${database}`
    const app = createClient({
      connectionString: connection.toString(),
      ssl: false,
      connectionTimeoutMillis: connectTimeoutMillis,
    })
    try {
      await app.connect()
      await app.query('SELECT current_database()')
    } finally {
      await app.end().catch(() => undefined)
    }
    const result = {
      schemaVersion: 1,
      status: 'provisioned',
      host,
      port,
      database,
      appUser,
      serverMajor,
    } as Omit<LocalPostgresProvisionResult, 'connectionUrl'> & { connectionUrl?: string }
    Object.defineProperty(result, 'connectionUrl', {
      value: connection.toString(),
      enumerable: false,
      configurable: false,
      writable: false,
    })
    return Object.freeze(result) as LocalPostgresProvisionResult
  } catch (error) {
    if (createdDatabase) {
      try {
        await admin.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
        createdDatabase = false
      } catch { /* leave the exact created database intact when safe rollback is unavailable */ }
    }
    if (createdRole && !createdDatabase) {
      try {
        await admin.query(`DROP ROLE ${quoteIdentifier(appUser)}`)
        createdRole = false
      } catch { /* preserve the original failure */ }
    }
    if (error instanceof Error && error.message.startsWith('setup_local_postgres_')) throw error
    throw safePgError(error)
  } finally {
    await admin.end().catch(() => undefined)
  }
}

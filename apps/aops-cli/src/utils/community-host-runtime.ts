import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export type AopsRepoDialect = 'sqlite' | 'pg'
export type AopsHostLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
type JsonRecord = Record<string, any>
type HostManifest = JsonRecord & { domain: string }
type RegistryOptions = { registrationsDir?: string; processEnv?: Record<string, string | undefined> }

const HOST_REGISTRATION_KIND = 'aops-host-registration'
const HOST_REGISTRATION_VERSION = '1'
const HOST_REGISTRATIONS_DIRNAME = 'host-registrations'
const AOPS_SQLITE_FILENAME = 'aops.aops.sqlite'
const AOPS_SERVER_ENV_FILENAME = 'aops.server.env'
const HOST_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal'])
const ALWAYS_PATH_KEYS = new Set([
  'workspaceRoot', 'cliDistEntry', 'cliSrcEntry', 'cliCwd', 'dcmManifestPath',
  'routesManifestPath', 'operationsManifestPath', 'metadataPath', 'manifestPath',
  'registrationPath',
])
const MAYBE_PATH_LIST_KEYS = new Set([
  'allowlist', 'toolingModuleCandidates', 'pluginModuleCandidates',
  'cliCommandCandidates', 'manifestFileCandidates',
])
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function dataRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function cloneJsonData(value: unknown, depth = 0): any {
  if (depth > 64) throw new Error('community_host_registration_json_depth_exceeded')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) {
    if (value.length > 10_000) throw new Error('community_host_registration_json_array_too_large')
    return value.map((item) => cloneJsonData(item, depth + 1))
  }
  if (!value || typeof value !== 'object') throw new Error('community_host_registration_json_value_invalid')
  const output: JsonRecord = Object.create(null)
  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error('community_host_registration_json_key_forbidden:' + key)
    output[key] = cloneJsonData(item, depth + 1)
  }
  return output
}

function normalizedDomain(value: unknown): string {
  const domain = nonEmpty(value)?.toLowerCase() ?? ''
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(domain)) throw new Error('host_registration_domain_invalid')
  return domain
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(nonEmpty).filter((item): item is string => Boolean(item)))]
}

function assertRegistrationEntries(manifest: HostManifest): void {
  const runtimeEnv = dataRecord(dataRecord(manifest.runtime).env)
  const hasEntries = ['manifestProviders', 'plugins', 'sources'].some(
    (key) => Array.isArray(manifest[key]) && manifest[key].length > 0,
  ) || Object.keys(runtimeEnv).length > 0
  if (!hasEntries) throw new Error('host_registration_entries_required:' + manifest.domain)
}

export function normalizeHostRegistrationManifest(input: unknown): HostManifest {
  const raw = cloneJsonData(dataRecord(input)) as JsonRecord
  const kind = nonEmpty(raw.kind) ?? HOST_REGISTRATION_KIND
  const registrationVersion = nonEmpty(raw.registrationVersion) ?? HOST_REGISTRATION_VERSION
  if (kind !== HOST_REGISTRATION_KIND) throw new Error('host_registration_kind_invalid')
  if (registrationVersion !== HOST_REGISTRATION_VERSION) throw new Error('host_registration_version_invalid')
  const manifest: HostManifest = {
    ...raw,
    kind,
    registrationVersion,
    domain: normalizedDomain(raw.domain),
    ...(nonEmpty(raw.displayName) ? { displayName: nonEmpty(raw.displayName) } : {}),
    ...(nonEmpty(raw.packageName) ? { packageName: nonEmpty(raw.packageName) } : {}),
    ...(nonEmpty(raw.description) ? { description: nonEmpty(raw.description) } : {}),
    ...(nonEmpty(raw.baseDir) ? { baseDir: nonEmpty(raw.baseDir) } : {}),
    ...(stringList(raw.notes).length > 0 ? { notes: stringList(raw.notes) } : {}),
  }
  assertRegistrationEntries(manifest)
  return manifest
}

function isWindowsAbsolute(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

function isPackageSpecifier(value: string): boolean {
  if (!value || value.startsWith('.') || value.startsWith('/') || isWindowsAbsolute(value)) return false
  if (value.includes('\\')) return false
  return value.startsWith('@') ? /^@[^/]+\/[^/]+(?:\/[^/]+)*$/.test(value) : /^[a-z0-9][a-z0-9._-]*$/i.test(value)
}

function materializePath(value: string, baseDir: string): string {
  const expanded = value === '~'
    ? os.homedir()
    : value.startsWith('~/') || value.startsWith('~\\')
      ? path.join(os.homedir(), value.slice(2))
      : value
  if (expanded.startsWith('file://') || expanded.includes('\${')) return expanded
  return path.resolve(baseDir, expanded)
}

function materializeMaybePath(value: string, baseDir: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('file://') || trimmed.includes('\${')) return trimmed
  if (isPackageSpecifier(trimmed)) return trimmed
  if (trimmed.startsWith('.') || trimmed.startsWith('~') || path.isAbsolute(trimmed) || isWindowsAbsolute(trimmed)) {
    return materializePath(trimmed, baseDir)
  }
  return path.extname(trimmed) || trimmed.includes('/') || trimmed.includes('\\')
    ? materializePath(trimmed, baseDir)
    : trimmed
}

function materializeValues(value: any, key: string, baseDir: string): any {
  if (typeof value === 'string') {
    if (ALWAYS_PATH_KEYS.has(key)) return materializePath(value, baseDir)
    if (key === 'module') return materializeMaybePath(value, baseDir)
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => (
      MAYBE_PATH_LIST_KEYS.has(key) && typeof item === 'string'
        ? materializeMaybePath(item, baseDir)
        : materializeValues(item, '', baseDir)
    ))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [
    childKey,
    materializeValues(item, childKey, baseDir),
  ]))
}

export function materializeHostRegistrationManifest(manifest: HostManifest, sourceBaseDir: string): HostManifest {
  const normalized = normalizeHostRegistrationManifest(manifest)
  const baseDir = normalized.baseDir
    ? materializePath(String(normalized.baseDir), sourceBaseDir)
    : path.resolve(sourceBaseDir)
  return normalizeHostRegistrationManifest({
    ...materializeValues(normalized, '', baseDir),
    baseDir,
  })
}

export function resolveAopsConfigDir(processEnv: Record<string, string | undefined> = process.env): string {
  const configured = nonEmpty(processEnv.AOPS_CLI_CONFIG_PATH) ?? nonEmpty(processEnv.AGENT_OPS_CONFIG_PATH)
  if (!configured) return path.join(os.homedir(), '.aops')
  if (process.platform !== 'win32' && isWindowsAbsolute(configured)) return path.join(os.homedir(), '.aops')
  const resolved = path.resolve(configured)
  return resolved.toLowerCase().endsWith('.json') ? path.dirname(resolved) : resolved
}

export function getHostRegistrationsDir(options: RegistryOptions = {}): string {
  const configured = nonEmpty(options.registrationsDir)
    ?? nonEmpty(options.processEnv?.AOPS_HOST_REGISTRATIONS_DIR)
    ?? nonEmpty(process.env.AOPS_HOST_REGISTRATIONS_DIR)
  return configured
    ? path.resolve(configured)
    : path.join(resolveAopsConfigDir(options.processEnv), HOST_REGISTRATIONS_DIRNAME)
}

function registrationFilePath(domain: string, options: RegistryOptions): string {
  return path.join(getHostRegistrationsDir(options), normalizedDomain(domain) + '.json')
}

export function writeHostRegistration(manifest: HostManifest, options: RegistryOptions = {}): string {
  const normalized = normalizeHostRegistrationManifest(manifest)
  const filePath = registrationFilePath(normalized.domain, options)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = filePath + '.' + process.pid + '.tmp'
  try {
    fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, filePath)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  return filePath
}

export function listInstalledHostRegistrations(options: RegistryOptions = {}): Array<{ domain: string; filePath: string; manifest: HostManifest }> {
  const registrationsDir = getHostRegistrationsDir(options)
  if (!fs.existsSync(registrationsDir)) return []
  return fs.readdirSync(registrationsDir)
    .filter((entry) => entry.toLowerCase().endsWith('.json'))
    .sort()
    .map((entry) => {
      const filePath = path.join(registrationsDir, entry)
      const stats = fs.lstatSync(filePath)
      if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('host_registration_registry_file_invalid:' + filePath)
      const manifest = normalizeHostRegistrationManifest(JSON.parse(fs.readFileSync(filePath, 'utf8')))
      return {
        domain: manifest.domain,
        filePath,
        manifest: normalizeHostRegistrationManifest({
          ...manifest,
          provenance: { ...dataRecord(manifest.provenance), source: filePath, sourceType: 'registry' },
        }),
      }
    })
}

export function unregisterHostRegistration(domain: string, options: RegistryOptions = {}): boolean {
  const filePath = registrationFilePath(domain, options)
  if (!fs.existsSync(filePath)) return false
  const stats = fs.lstatSync(filePath)
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('host_registration_registry_file_invalid:' + filePath)
  fs.unlinkSync(filePath)
  return true
}

function mergeBy(items: JsonRecord[], incoming: JsonRecord[], key: string): JsonRecord[] {
  const values = new Map<string, JsonRecord>()
  for (const item of incoming) values.set(String(item[key] ?? ''), item)
  for (const item of items) values.set(String(item[key] ?? ''), item)
  return [...values.values()].filter((item) => nonEmpty(item[key])).sort((a, b) => String(a[key]).localeCompare(String(b[key])))
}

export function mergeHostRegistrationsIntoConfig(baseConfig: JsonRecord, registrations: HostManifest[]): JsonRecord {
  let runtimeEnv: JsonRecord = {}
  let allowlist: string[] = []
  let strictAllowlist = false
  let tolerantBootstrap = false
  let providers: JsonRecord[] = []
  let sources: JsonRecord[] = []
  let plugins: JsonRecord[] = []
  for (const registration of registrations.map(normalizeHostRegistrationManifest)) {
    runtimeEnv = { ...runtimeEnv, ...dataRecord(dataRecord(registration.runtime).env) }
    const loader = dataRecord(registration.pluginLoader)
    allowlist = [...new Set([...allowlist, ...stringList(loader.allowlist), ...(registration.plugins ?? []).map((item: any) => nonEmpty(item.module)).filter(Boolean)])]
    strictAllowlist ||= loader.strictAllowlist === true
    tolerantBootstrap ||= loader.tolerantBootstrap === true
    providers = mergeBy(providers, registration.manifestProviders ?? [], 'id')
    sources = mergeBy(sources, registration.sources ?? [], 'id')
    plugins = mergeBy(plugins, registration.plugins ?? [], 'domain')
  }
  const baseRuntime = dataRecord(baseConfig.runtime)
  const baseLoader = dataRecord(baseConfig.pluginLoader)
  const baseGateway = dataRecord(baseConfig.agentGateway)
  const baseCatalog = dataRecord(baseGateway.catalog)
  return {
    runtime: { ...baseRuntime, env: { ...runtimeEnv, ...dataRecord(baseRuntime.env) } },
    pluginLoader: {
      allowlist: [...new Set([...allowlist, ...stringList(baseLoader.allowlist)])],
      strictAllowlist: baseLoader.strictAllowlist ?? strictAllowlist,
      tolerantBootstrap: baseLoader.tolerantBootstrap ?? tolerantBootstrap,
    },
    agentGateway: providers.length > 0 || sources.length > 0 || Object.keys(baseGateway).length > 0 ? {
      ...baseGateway,
      enabled: baseGateway.enabled ?? true,
      includeLocal: baseGateway.includeLocal ?? true,
      sources: mergeBy(baseGateway.sources ?? [], sources, 'id'),
      catalog: {
        ...baseCatalog,
        enabled: baseCatalog.enabled ?? true,
        manifestProviders: mergeBy(baseCatalog.manifestProviders ?? [], providers, 'id'),
      },
    } : undefined,
    plugins: mergeBy(baseConfig.plugins ?? [], plugins, 'domain'),
  }
}

function normalizeLogLevel(value: unknown): AopsHostLogLevel | undefined {
  const normalized = nonEmpty(value)?.toLowerCase()
  return normalized && HOST_LOG_LEVELS.has(normalized) ? normalized as AopsHostLogLevel : undefined
}

function stripQuotes(value: string): string {
  return value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ? value.slice(1, -1)
    : value
}

function parseEnv(content: string): Record<string, string> {
  const assignments: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (match) assignments[match[1]] = stripQuotes(String(match[2]).trim())
  }
  return assignments
}

function quoteEnv(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : JSON.stringify(value)
}

export function isSqliteRepoUrl(repoUrl: string): boolean {
  const value = repoUrl.trim().toLowerCase()
  return value === ':memory:' || value.startsWith('sqlite:') || value.startsWith('file:') || /\.(?:db|sqlite|sqlite3)$/.test(value)
}

export function inferAopsRepoDialect(repoUrl: string): AopsRepoDialect {
  return isSqliteRepoUrl(repoUrl) ? 'sqlite' : 'pg'
}

export function getAopsRuntimeConfigDir(processEnv: NodeJS.ProcessEnv = process.env): string {
  const explicit = nonEmpty(processEnv.AOPS_CLI_CONFIG_PATH) ?? nonEmpty(processEnv.AGENT_OPS_CONFIG_PATH)
  return !explicit && processEnv.NODE_ENV === 'test'
    ? path.resolve(process.cwd(), '.tmp', 'aops-runtime-test-config')
    : resolveAopsConfigDir(processEnv)
}

export function getAopsServerEnvPath(processEnv: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(getAopsRuntimeConfigDir(processEnv), AOPS_SERVER_ENV_FILENAME)
}

export function readAopsServerEnvConfig(processEnv: NodeJS.ProcessEnv = process.env, explicitPath?: string) {
  const envPath = explicitPath ? path.resolve(explicitPath) : getAopsServerEnvPath(processEnv)
  if (!fs.existsSync(envPath)) return { path: envPath, exists: false, assignments: {}, repoUrl: null, repoDialect: null, redactedRepoUrl: null, hostSettings: { logLevel: null } }
  const assignments = parseEnv(fs.readFileSync(envPath, 'utf8'))
  const repoUrl = nonEmpty(assignments.AOPS_REPO_URL) ?? nonEmpty(assignments.AOPS_PG_URL) ?? nonEmpty(assignments.AOPS_SQLITE_URL) ?? null
  let redactedRepoUrl = repoUrl
  try {
    if (repoUrl) {
      const parsed = new URL(repoUrl)
      if (parsed.password) parsed.password = '***'
      redactedRepoUrl = parsed.toString()
    }
  } catch {}
  return { path: envPath, exists: true, assignments, repoUrl, repoDialect: repoUrl ? inferAopsRepoDialect(repoUrl) : null, redactedRepoUrl, hostSettings: { logLevel: normalizeLogLevel(assignments.AOPS_LOG_LEVEL) ?? normalizeLogLevel(assignments.LOG_LEVEL) ?? null } }
}

export function writeAopsServerEnvConfig(patch: { repoUrl?: string; logLevel?: AopsHostLogLevel }, processEnv: NodeJS.ProcessEnv = process.env, explicitPath?: string) {
  const current = readAopsServerEnvConfig(processEnv, explicitPath)
  const next = { ...current.assignments } as Record<string, string>
  if (patch.repoUrl !== undefined) {
    const repoUrl = nonEmpty(patch.repoUrl)
    delete next.AOPS_REPO_URL; delete next.AOPS_PG_URL; delete next.AOPS_SQLITE_URL
    if (repoUrl) {
      next.AOPS_REPO_URL = repoUrl
      next[inferAopsRepoDialect(repoUrl) === 'sqlite' ? 'AOPS_SQLITE_URL' : 'AOPS_PG_URL'] = repoUrl
    }
  }
  if (patch.logLevel !== undefined) {
    const level = normalizeLogLevel(patch.logLevel)
    if (level) next.AOPS_LOG_LEVEL = level
    else delete next.AOPS_LOG_LEVEL
  }
  const managed = new Set(['AOPS_REPO_URL', 'AOPS_PG_URL', 'AOPS_SQLITE_URL', 'AOPS_LOG_LEVEL'])
  const existingLines = current.exists ? fs.readFileSync(current.path, 'utf8').split(/\r?\n/) : []
  const touched = new Set<string>()
  const lines = existingLines.map((line: string) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || !managed.has(match[1])) return line
    touched.add(match[1])
    return next[match[1]] ? match[1] + '=' + quoteEnv(next[match[1]]) : ''
  })
  for (const key of managed) if (next[key] && !touched.has(key)) lines.push(key + '=' + quoteEnv(next[key]))
  fs.mkdirSync(path.dirname(current.path), { recursive: true })
  fs.writeFileSync(current.path, lines.filter((line: string, index: number, all: string[]) => line || all[index - 1]).join('\n').trimEnd() + '\n', { mode: 0o600 })
  try { fs.chmodSync(current.path, 0o600) } catch {}
  return readAopsServerEnvConfig(processEnv, current.path)
}

export function getDefaultAopsSqlitePath(processEnv: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(getAopsRuntimeConfigDir(processEnv), AOPS_SQLITE_FILENAME)
}

export function getDefaultAopsSqliteRepoUrl(processEnv: NodeJS.ProcessEnv = process.env): string {
  return pathToFileURL(getDefaultAopsSqlitePath(processEnv)).href
}

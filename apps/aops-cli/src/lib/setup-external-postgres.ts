import { Client, type ClientConfig } from 'pg'

import { type CommunityPostgresTlsPolicy } from './community-instance-contract.js'
import { loadExternalPostgresUrl } from './community-native-lifecycle.js'

type ExternalPostgresProbeClient = Readonly<{
  connect: () => Promise<void>
  query: <T = unknown>(text: string) => Promise<{ rows: T[] }>
  end: () => Promise<void>
}>

export type ExternalPostgresProbeResult = Readonly<{
  status: 'ready'
  tlsPolicy: CommunityPostgresTlsPolicy
  transport: 'encrypted' | 'unencrypted'
  serverMajor: number
}>

export type ExternalPostgresProbeOptions = Readonly<{
  configRef: string
  tlsPolicy: CommunityPostgresTlsPolicy
  timeoutMs?: number
}>

export type ExternalPostgresProbeDependencies = Readonly<{
  createClient?: (config: ClientConfig) => ExternalPostgresProbeClient
}>

export class ExternalPostgresProbeError extends Error {
  readonly category: 'tls' | 'auth' | 'database' | 'network' | 'unknown'

  constructor(
    code: string,
    category: ExternalPostgresProbeError['category'],
    options?: ErrorOptions,
  ) {
    super(code, options)
    this.name = 'ExternalPostgresProbeError'
    this.category = category
  }
}

export function isExternalPostgresTlsProbeError(error: unknown): boolean {
  return error instanceof ExternalPostgresProbeError && error.category === 'tls'
}

function safeProbeError(error: unknown): ExternalPostgresProbeError {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const code = String(record.code ?? '')
  const message = String(record.message ?? '').toLowerCase()
  if (
    /ssl|tls|certificate|self[- ]signed|hostname|altname/.test(message) ||
    ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
      'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)
  ) {
    return new ExternalPostgresProbeError('setup_external_postgres_tls_connection_failed', 'tls', { cause: error })
  }
  if (code === '28P01' || code === '28000') {
    return new ExternalPostgresProbeError('setup_external_postgres_auth_failed', 'auth', { cause: error })
  }
  if (code === '3D000') {
    return new ExternalPostgresProbeError('setup_external_postgres_database_not_found', 'database', { cause: error })
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT'].includes(code)) {
    return new ExternalPostgresProbeError('setup_external_postgres_unreachable', 'network', { cause: error })
  }
  return new ExternalPostgresProbeError('setup_external_postgres_connection_failed', 'unknown', { cause: error })
}

export async function probeExternalPostgresConnection(
  options: ExternalPostgresProbeOptions,
  dependencies: ExternalPostgresProbeDependencies = {},
): Promise<ExternalPostgresProbeResult> {
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs ?? 10_000), 500), 30_000)
  const connectionString = loadExternalPostgresUrl(options.configRef, options.tlsPolicy)
  const createClient = dependencies.createClient
    ?? ((config) => new Client(config) as unknown as ExternalPostgresProbeClient)
  const client = createClient({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
  })
  try {
    await client.connect()
    const inspected = await client.query<{
      server_version_num: string
    }>("SELECT current_setting('server_version_num') AS server_version_num")
    const serverMajor = Math.floor(Number(inspected.rows[0]?.server_version_num) / 10_000)
    if (!Number.isSafeInteger(serverMajor) || serverMajor < 1) {
      throw new Error('postgres_server_version_invalid')
    }
    // The pg client already enforces the selected sslmode while connecting.
    // Do not infer client transport from pg_stat_ssl: managed poolers may expose
    // their database-side backend row rather than the client-to-pooler socket.
    const encrypted = options.tlsPolicy !== 'disable'
    return Object.freeze({
      status: 'ready',
      tlsPolicy: options.tlsPolicy,
      transport: encrypted ? 'encrypted' : 'unencrypted',
      serverMajor,
    })
  } catch (error) {
    if (error instanceof ExternalPostgresProbeError) throw error
    throw safeProbeError(error)
  } finally {
    await client.end().catch(() => undefined)
  }
}

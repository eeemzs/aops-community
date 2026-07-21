import { resolveAopsServerEnvPath } from '@aops/runtime-config'

export type CommunityServerRuntime = 'native' | 'oci'
export type CommunityPostgresMode = 'external' | 'container'
export type CommunityPostgresTlsPolicy = 'disable' | 'require' | 'verify-full'
export type CommunityServerExposure = 'loopback' | 'container'

export type CommunityInstanceContract = Readonly<{
  schemaVersion: 1
  instanceId: string
  profile: 'native-external-postgres' | 'native-container-postgres' | 'oci-managed-stack'
  runtime: CommunityServerRuntime
  postgres: Readonly<{
    mode: 'external' | 'container' | 'managed-stack'
    configRef?: string
    tlsPolicy?: CommunityPostgresTlsPolicy
  }>
  server: Readonly<{
    port: number
    exposure: CommunityServerExposure
    publicPort: number
  }>
  lifecycleAuthority: 'local-instance'
  implementation: 'p1-contract-only' | 'native-v1-supervisor' | 'oci-v1-adapter'
}>

const INSTANCE_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

function instanceId(value: string | undefined): string {
  const normalized = (value ?? 'default').trim().toLowerCase()
  if (!INSTANCE_ID.test(normalized)) throw new Error('community_instance_name_invalid')
  return normalized
}

function portNumber(value: string | number | undefined): number {
  const port = Number(value ?? 5900)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('community_port_invalid')
  return port
}

export function buildCommunityInstanceContract(input: {
  runtime?: string
  postgres?: string
  postgresConfig?: string
  postgresTls?: string
  exposure?: string
  publicPort?: string | number
  instance?: string
  port?: string | number
  processEnv?: NodeJS.ProcessEnv
}): CommunityInstanceContract {
  if (input.runtime !== 'native' && input.runtime !== 'oci') {
    throw new Error('community_setup_runtime_required:use_--runtime_native_or_oci')
  }
  const runtime: CommunityServerRuntime = input.runtime
  const exposure = input.exposure ?? 'loopback'
  if (exposure !== 'loopback' && exposure !== 'container') {
    throw new Error('community_setup_exposure_invalid:use_--exposure_loopback_or_container')
  }
  const port = portNumber(input.port)
  const publicPort = portNumber(input.publicPort ?? port)
  if (exposure === 'loopback' && input.publicPort !== undefined && publicPort !== port) {
    throw new Error('community_setup_public_port_requires_container_exposure')
  }
  if (exposure === 'container' && port !== 5900) {
    throw new Error('community_setup_container_exposure_port_required:5900')
  }
  const server = Object.freeze({ port, exposure, publicPort })
  const base = {
    schemaVersion: 1 as const,
    instanceId: instanceId(input.instance),
    runtime,
    server,
    lifecycleAuthority: 'local-instance' as const,
  }
  if (runtime === 'oci') {
    if (
      input.postgres || input.postgresConfig || input.postgresTls ||
      input.exposure !== undefined || input.publicPort !== undefined
    ) {
      throw new Error('community_setup_oci_native_options_refused')
    }
    return Object.freeze({
      ...base,
      profile: 'oci-managed-stack',
      postgres: Object.freeze({ mode: 'managed-stack' as const }),
      implementation: 'oci-v1-adapter',
    })
  }
  if (input.postgres !== 'external' && input.postgres !== 'container') {
    throw new Error('community_setup_native_postgres_required:use_--postgres_external_or_container')
  }
  if (input.postgres === 'container') {
    if (input.postgresConfig || input.postgresTls) {
      throw new Error('community_setup_container_postgres_external_options_refused')
    }
    if (exposure !== 'loopback') {
      throw new Error('community_setup_managed_postgres_requires_loopback_exposure')
    }
    return Object.freeze({
      ...base,
      profile: 'native-container-postgres',
      postgres: Object.freeze({ mode: 'container' as const }),
      implementation: 'native-v1-supervisor',
    })
  }
  if (!['disable', 'require', 'verify-full'].includes(String(input.postgresTls))) {
    throw new Error('community_setup_external_postgres_tls_required:use_--postgres-tls')
  }
  const configInput = input.postgresConfig?.trim()
  if (configInput) {
    const isWindowsPath = /^[A-Za-z]:[\\/]/.test(configInput)
    if (
      /[\0\r\n]/.test(configInput) ||
      (!isWindowsPath && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(configInput)) ||
      /[=@;]/.test(configInput) ||
      /(?:^|\s)(?:host|user|password|pwd|dbname|server|data\s+source|user\s+id|uid|database|initial\s+catalog|pghost|pgport|pgdatabase|pguser|pgpassword|pgservice|pgsslmode)\s*=/i.test(configInput)
    ) {
      throw new Error('community_setup_external_postgres_config_must_be_file_reference')
    }
  }
  const configRef = resolveAopsServerEnvPath(
    { explicitPath: configInput },
    input.processEnv ?? process.env,
  ).path
  return Object.freeze({
    ...base,
    profile: 'native-external-postgres',
    postgres: Object.freeze({
      mode: 'external' as const,
      configRef,
      tlsPolicy: input.postgresTls as CommunityPostgresTlsPolicy,
    }),
    implementation: 'native-v1-supervisor',
  })
}

export function parseCommunityInstanceContract(value: unknown): CommunityInstanceContract {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_instance_contract_invalid')
  }
  const input = value as Record<string, any>
  const ociRuntime = input.runtime === 'oci'
  if (
    ociRuntime &&
    (
      (input.server?.exposure !== undefined && input.server.exposure !== 'loopback') ||
      (input.server?.publicPort !== undefined && input.server.publicPort !== input.server?.port)
    )
  ) throw new Error('community_instance_contract_oci_server_invalid')
  const rebuilt = buildCommunityInstanceContract({
    runtime: input.runtime,
    postgres: input.postgres?.mode === 'managed-stack' ? undefined : input.postgres?.mode,
    postgresConfig: input.postgres?.configRef,
    postgresTls: input.postgres?.tlsPolicy,
    exposure: ociRuntime ? undefined : input.server?.exposure,
    publicPort: ociRuntime ? undefined : input.server?.publicPort,
    instance: input.instanceId,
    port: input.server?.port,
  })
  if (
    input.schemaVersion !== 1 || input.profile !== rebuilt.profile ||
    input.lifecycleAuthority !== 'local-instance' || input.implementation !== rebuilt.implementation
  ) {
    throw new Error('community_instance_contract_schema_invalid')
  }
  return rebuilt
}

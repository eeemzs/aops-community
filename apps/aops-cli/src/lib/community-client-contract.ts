export const COMMUNITY_PUBLIC_CLI_PACKAGE_NAME = '@aopslab/aops-cli'
export const COMMUNITY_CLI_COMMAND_SCHEMA_VERSION = 1
export const COMMUNITY_CLIENT_COMPATIBILITY_SCHEMA_VERSION = 1
export const COMMUNITY_CLIENT_COMPATIBILITY_PROTOCOL = 'aops-community-client-server'

export type CommunityCliArtifactSource =
  | 'repo-local'
  | 'public-release-bundle'
  | 'unknown'

export type CommunityCliIdentity = Readonly<{
  packageName: typeof COMMUNITY_PUBLIC_CLI_PACKAGE_NAME
  version: string
  commandSchemaVersion: number
  artifactSource: CommunityCliArtifactSource
  launcher: 'unknown'
}>

export type CommunityServerCompatibility = Readonly<{
  schemaVersion: 1
  protocol: typeof COMMUNITY_CLIENT_COMPATIBILITY_PROTOCOL
  server: Readonly<{
    name: 'aops-server'
    packageVersion: string
    releaseVersion: string | null
    source: 'release' | 'development'
  }>
  cliCommandSchema: Readonly<{
    min: number
    max: number
  }>
}>

export type CommunityCompatibilityResult = Readonly<{
  status: 'compatible' | 'warning' | 'incompatible'
  compatible: boolean
  reason: string
  cli: CommunityCliIdentity
  server?: CommunityServerCompatibility['server']
  acceptedCommandSchema?: CommunityServerCompatibility['cliCommandSchema']
}>

declare const __AOPS_CLI_VERSION__: string | undefined
declare const __AOPS_CLI_ARTIFACT_SOURCE__: CommunityCliArtifactSource | undefined
declare const __AOPS_CLI_COMMAND_SCHEMA_VERSION__: number | undefined

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function validSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)
}

function semverCore(value: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

function compareCore(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1
  }
  return 0
}

export function resolveCommunityCliIdentity(
  environment: NodeJS.ProcessEnv = process.env,
): CommunityCliIdentity {
  const injectedVersion = typeof __AOPS_CLI_VERSION__ !== 'undefined' ? __AOPS_CLI_VERSION__ : undefined
  const version = nonEmpty(environment.AOPS_CLI_VERSION) ?? nonEmpty(injectedVersion) ?? '0.0.1'
  if (!validSemver(version)) throw new Error('community_cli_version_invalid')
  const injectedSource = typeof __AOPS_CLI_ARTIFACT_SOURCE__ !== 'undefined'
    ? __AOPS_CLI_ARTIFACT_SOURCE__
    : undefined
  const requestedSource = nonEmpty(environment.AOPS_CLI_ARTIFACT_SOURCE) ?? injectedSource ?? 'repo-local'
  const artifactSource: CommunityCliArtifactSource =
    requestedSource === 'repo-local' || requestedSource === 'public-release-bundle'
      ? requestedSource
      : 'unknown'
  const commandSchemaVersion = typeof __AOPS_CLI_COMMAND_SCHEMA_VERSION__ !== 'undefined'
    ? __AOPS_CLI_COMMAND_SCHEMA_VERSION__
    : COMMUNITY_CLI_COMMAND_SCHEMA_VERSION
  if (!Number.isSafeInteger(commandSchemaVersion) || commandSchemaVersion < 1) {
    throw new Error('community_cli_command_schema_invalid')
  }
  return Object.freeze({
    packageName: COMMUNITY_PUBLIC_CLI_PACKAGE_NAME,
    version,
    commandSchemaVersion,
    artifactSource,
    launcher: 'unknown',
  })
}

export function parseCommunityServerCompatibility(value: unknown): CommunityServerCompatibility {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_compatibility_handshake_missing')
  }
  const input = value as Record<string, any>
  const server = input.server
  const range = input.cliCommandSchema
  if (
    input.schemaVersion !== COMMUNITY_CLIENT_COMPATIBILITY_SCHEMA_VERSION ||
    input.protocol !== COMMUNITY_CLIENT_COMPATIBILITY_PROTOCOL ||
    !server || typeof server !== 'object' || server.name !== 'aops-server' ||
    !validSemver(String(server.packageVersion ?? '')) ||
    (server.releaseVersion !== null && !validSemver(String(server.releaseVersion ?? ''))) ||
    !['release', 'development'].includes(server.source) ||
    !range || typeof range !== 'object' ||
    !Number.isSafeInteger(range.min) || !Number.isSafeInteger(range.max) ||
    range.min < 1 || range.max < range.min
  ) {
    throw new Error('community_compatibility_handshake_invalid')
  }
  return Object.freeze({
    schemaVersion: 1,
    protocol: COMMUNITY_CLIENT_COMPATIBILITY_PROTOCOL,
    server: Object.freeze({
      name: 'aops-server',
      packageVersion: String(server.packageVersion),
      releaseVersion: server.releaseVersion === null ? null : String(server.releaseVersion),
      source: server.source,
    }),
    cliCommandSchema: Object.freeze({ min: range.min, max: range.max }),
  })
}

export function evaluateCommunityCompatibility(
  handshakeInput: unknown,
  cli: CommunityCliIdentity = resolveCommunityCliIdentity(),
): CommunityCompatibilityResult {
  let handshake: CommunityServerCompatibility
  try {
    handshake = parseCommunityServerCompatibility(handshakeInput)
  } catch (error) {
    return Object.freeze({
      status: 'incompatible',
      compatible: false,
      reason: error instanceof Error ? error.message : 'community_compatibility_handshake_invalid',
      cli,
    })
  }
  const accepted = handshake.cliCommandSchema
  if (cli.commandSchemaVersion < accepted.min || cli.commandSchemaVersion > accepted.max) {
    return Object.freeze({
      status: 'incompatible',
      compatible: false,
      reason: `community_cli_command_schema_out_of_range:${cli.commandSchemaVersion}:${accepted.min}-${accepted.max}`,
      cli,
      server: handshake.server,
      acceptedCommandSchema: accepted,
    })
  }
  const releaseVersion = handshake.server.releaseVersion
  if (!releaseVersion) {
    return Object.freeze({
      status: 'warning',
      compatible: true,
      reason: 'community_server_development_identity',
      cli,
      server: handshake.server,
      acceptedCommandSchema: accepted,
    })
  }
  const cliCore = semverCore(cli.version)!
  const serverCore = semverCore(releaseVersion)!
  if (cliCore[0] !== serverCore[0]) {
    return Object.freeze({
      status: 'incompatible',
      compatible: false,
      reason: `community_release_major_mismatch:cli=${cli.version}:server=${releaseVersion}`,
      cli,
      server: handshake.server,
      acceptedCommandSchema: accepted,
    })
  }
  const comparison = compareCore(serverCore, cliCore)
  if (comparison !== 0 || cli.version !== releaseVersion) {
    return Object.freeze({
      status: 'warning',
      compatible: true,
      reason: comparison > 0
        ? `community_server_newer_than_cli:cli=${cli.version}:server=${releaseVersion}`
        : `community_cli_server_version_difference:cli=${cli.version}:server=${releaseVersion}`,
      cli,
      server: handshake.server,
      acceptedCommandSchema: accepted,
    })
  }
  return Object.freeze({
    status: 'compatible',
    compatible: true,
    reason: 'community_client_server_compatible',
    cli,
    server: handshake.server,
    acceptedCommandSchema: accepted,
  })
}

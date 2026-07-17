export const COMMUNITY_CLIENT_COMPATIBILITY_SCHEMA_VERSION = 1
export const COMMUNITY_CLIENT_COMPATIBILITY_PROTOCOL = 'aops-community-client-server'
export const COMMUNITY_CLI_COMMAND_SCHEMA_MIN = 1
export const COMMUNITY_CLI_COMMAND_SCHEMA_MAX = 1

declare const __AOPS_SERVER_PACKAGE_VERSION__: string | undefined

const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function packageVersion(environment: NodeJS.ProcessEnv): string {
  const injected = typeof __AOPS_SERVER_PACKAGE_VERSION__ !== 'undefined'
    ? __AOPS_SERVER_PACKAGE_VERSION__
    : undefined
  for (const candidate of [environment.AOPS_SERVER_PACKAGE_VERSION, injected]) {
    const value = candidate?.trim()
    if (value && EXACT_SEMVER.test(value)) return value
  }
  return '0.0.0'
}

function releaseVersion(environment: NodeJS.ProcessEnv): string | null {
  const value = environment.AOPS_RELEASE_VERSION?.trim() || environment.AOPS_SERVER_RELEASE_VERSION?.trim()
  return value && EXACT_SEMVER.test(value) ? value : null
}

export function buildCommunityClientCompatibility(environment: NodeJS.ProcessEnv = process.env) {
  const release = releaseVersion(environment)
  return Object.freeze({
    schemaVersion: COMMUNITY_CLIENT_COMPATIBILITY_SCHEMA_VERSION as 1,
    protocol: COMMUNITY_CLIENT_COMPATIBILITY_PROTOCOL,
    server: Object.freeze({
      name: 'aops-server' as const,
      packageVersion: packageVersion(environment),
      releaseVersion: release,
      source: release ? 'release' as const : 'development' as const,
    }),
    cliCommandSchema: Object.freeze({
      min: COMMUNITY_CLI_COMMAND_SCHEMA_MIN,
      max: COMMUNITY_CLI_COMMAND_SCHEMA_MAX,
    }),
  })
}

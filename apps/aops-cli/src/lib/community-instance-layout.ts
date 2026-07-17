import { homedir } from 'node:os'
import path from 'node:path'

const DEFAULT_INSTANCE_ID = 'default'
const INSTANCE_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const PORTABLE_RESERVED_NAME = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])$/i
const POSIX_PLATFORMS = new Set<NodeJS.Platform>([
  'aix',
  'android',
  'cygwin',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'netbsd',
  'openbsd',
  'sunos',
])

export type CommunityInstanceLayout = Readonly<{
  schemaVersion: 1
  instanceId: string
  dataRoot: string
  instanceRoot: string
  stateDir: string
  configDir: string
  secretsDir: string
  backupsDir: string
  stagingDir: string
}>

export type ResolveCommunityInstanceLayoutOptions = Readonly<{
  instanceId?: string
  platform?: NodeJS.Platform
  environment?: Readonly<Record<string, string | undefined>>
  homeDirectory?: string
}>

function fail(code: string): never {
  throw new Error(code)
}

function selectPath(platform: NodeJS.Platform): typeof path.win32 | typeof path.posix {
  if (platform === 'win32') return path.win32
  if (POSIX_PLATFORMS.has(platform)) return path.posix
  return fail('community_instance_platform_unsupported')
}

function normalizeAbsoluteDirectory(
  value: string | undefined,
  pathApi: typeof path.win32 | typeof path.posix,
  code: string,
): string {
  if (typeof value !== 'string' || value === '' || value.trim() !== value || !pathApi.isAbsolute(value)) {
    return fail(code)
  }
  const normalized = pathApi.normalize(value)
  if (pathApi === path.win32 && !/^[A-Za-z]:\\/.test(normalized)) return fail(code)
  if (normalized === pathApi.parse(normalized).root) return fail(code)
  return normalized
}

function resolveInstanceId(value: string | undefined): string {
  const instanceId = value ?? DEFAULT_INSTANCE_ID
  if (
    typeof instanceId !== 'string'
    || !INSTANCE_ID.test(instanceId)
    || PORTABLE_RESERVED_NAME.test(instanceId)
  ) {
    return fail('community_instance_id_invalid')
  }
  return instanceId
}

function isConfined(
  root: string,
  candidate: string,
  pathApi: typeof path.win32 | typeof path.posix,
): boolean {
  const relative = pathApi.relative(root, candidate)
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${pathApi.sep}`)
    && !pathApi.isAbsolute(relative)
}

function resolveDataRoot(
  platform: NodeJS.Platform,
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
  pathApi: typeof path.win32 | typeof path.posix,
): string {
  const home = normalizeAbsoluteDirectory(
    homeDirectory,
    pathApi,
    'community_instance_home_invalid',
  )

  if (platform === 'win32') {
    const localAppData = Object.prototype.hasOwnProperty.call(environment, 'LOCALAPPDATA')
      ? normalizeAbsoluteDirectory(
          environment.LOCALAPPDATA,
          pathApi,
          'community_instance_local_app_data_invalid',
        )
      : pathApi.join(home, 'AppData', 'Local')
    return pathApi.join(localAppData, 'AOPS', 'Community')
  }

  if (platform === 'darwin') {
    return pathApi.join(home, 'Library', 'Application Support', 'AOPS', 'Community')
  }

  const xdgDataHome = Object.prototype.hasOwnProperty.call(environment, 'XDG_DATA_HOME')
    ? normalizeAbsoluteDirectory(
        environment.XDG_DATA_HOME,
        pathApi,
        'community_instance_xdg_data_home_invalid',
      )
    : pathApi.join(home, '.local', 'share')
  return pathApi.join(xdgDataHome, 'aops', 'community')
}

export function resolveCommunityInstanceLayout(
  options: ResolveCommunityInstanceLayoutOptions = {},
): CommunityInstanceLayout {
  const platform = options.platform ?? process.platform
  const pathApi = selectPath(platform)
  const environment = options.environment ?? process.env
  const instanceId = resolveInstanceId(options.instanceId)
  const dataRoot = resolveDataRoot(
    platform,
    environment,
    options.homeDirectory ?? homedir(),
    pathApi,
  )
  const instanceRoot = pathApi.join(dataRoot, 'instances', instanceId)
  const paths = {
    stateDir: pathApi.join(instanceRoot, 'state'),
    configDir: pathApi.join(instanceRoot, 'config'),
    secretsDir: pathApi.join(instanceRoot, 'secrets'),
    backupsDir: pathApi.join(instanceRoot, 'backups'),
    stagingDir: pathApi.join(instanceRoot, 'staging'),
  }

  if (
    !pathApi.isAbsolute(dataRoot)
    || !isConfined(dataRoot, instanceRoot, pathApi)
    || Object.values(paths).some((candidate) => !isConfined(instanceRoot, candidate, pathApi))
  ) {
    return fail('community_instance_layout_escape')
  }

  return Object.freeze({
    schemaVersion: 1,
    instanceId,
    dataRoot,
    instanceRoot,
    ...paths,
  })
}

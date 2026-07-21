import { inspectCommunityInstall } from './community-lifecycle.js'
import {
  inspectCommunityNativeInstall,
  inspectCommunityNativeRuntime,
} from './community-native-lifecycle.js'
import { getActiveApiTarget } from '../utils/config.js'

export type CommunityHomeMode = 'setup' | 'operate'

export type CommunityHomeDependencies = Readonly<{
  inspectNative?: typeof inspectCommunityNativeInstall
  inspectOci?: typeof inspectCommunityInstall
  getActiveTarget?: typeof getActiveApiTarget
}>

export type CommunityHomeServerAction =
  | 'not-applicable'
  | 'already-active'
  | 'started'
  | 'attention-required'

export type CommunityHomeServerDependencies = Readonly<{
  inspectNative?: typeof inspectCommunityNativeInstall
  inspectRuntime?: typeof inspectCommunityNativeRuntime
}>

export type CommunityHomeServerStarter = (options: {
  instance?: string
  dataRoot?: string
  detach?: boolean
  silent?: boolean
}) => Promise<void>

function isRemoteTarget(apiBaseUrl: string): boolean {
  try {
    const host = new URL(apiBaseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host !== 'localhost' && host !== '::1' && !/^127(?:\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

/**
 * Keep the no-argument home fast and local. A complete native install, a
 * legacy OCI install, or a configured remote AOPS target opens the operator
 * home; missing, partial, or conflicting local state routes the operator to
 * setup where the richer readiness checks live.
 */
export function resolveCommunityHomeMode(
  dependencies: CommunityHomeDependencies = {},
): CommunityHomeMode {
  try {
    const native = (dependencies.inspectNative ?? inspectCommunityNativeInstall)()
    if (native.status === 'installed') return 'operate'
    if (native.status !== 'not-installed') return 'setup'

    const oci = (dependencies.inspectOci ?? inspectCommunityInstall)()
    if (oci.status === 'installed') return 'operate'
    if (oci.status !== 'not-installed') return 'setup'

    const activeTarget = (dependencies.getActiveTarget ?? getActiveApiTarget)()
    return activeTarget && isRemoteTarget(activeTarget.apiBaseUrl) ? 'operate' : 'setup'
  } catch {
    return 'setup'
  }
}

/**
 * A parameterless `aops` invocation is also the local runtime entry point.
 * Start only an installed, identity-verified native instance that is safely
 * stopped or crashed. Remote targets, missing/partial installs, and ambiguous
 * live-process states must never cause an implicit local mutation.
 */
export async function ensureCommunityHomeServerRunning(
  startServer: CommunityHomeServerStarter,
  dependencies: CommunityHomeServerDependencies = {},
): Promise<CommunityHomeServerAction> {
  const native = (dependencies.inspectNative ?? inspectCommunityNativeInstall)()
  if (native.status === 'not-installed') return 'not-applicable'
  if (native.status !== 'installed' || !native.state) return 'attention-required'

  const runtime = await (dependencies.inspectRuntime ?? inspectCommunityNativeRuntime)({
    instanceName: native.state.instanceName,
    dataRoot: native.paths.dataRoot,
  })
  if (runtime.runtimeState === 'running' || runtime.runtimeState === 'starting') {
    return 'already-active'
  }
  if (runtime.runtimeState !== 'stopped' && runtime.runtimeState !== 'crashed') {
    return 'attention-required'
  }

  await startServer({
    instance: native.state.instanceName,
    dataRoot: native.paths.dataRoot,
    detach: true,
    silent: true,
  })
  return 'started'
}

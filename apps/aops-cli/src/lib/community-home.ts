import { inspectCommunityInstall } from './community-lifecycle.js'
import { inspectCommunityNativeInstall } from './community-native-lifecycle.js'
import { getActiveApiTarget } from '../utils/config.js'

export type CommunityHomeMode = 'setup' | 'operate'

export type CommunityHomeDependencies = Readonly<{
  inspectNative?: typeof inspectCommunityNativeInstall
  inspectOci?: typeof inspectCommunityInstall
  getActiveTarget?: typeof getActiveApiTarget
}>

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

import { getResolvedAopsServerRuntimeConfig, readRuntimeConfigAdmin } from '$lib/server/aops-runtime-config'

export async function readBootstrapHealth() {
  const runtime = getResolvedAopsServerRuntimeConfig()
  const admin = readRuntimeConfigAdmin()
  const errors = runtime.repoUrl ? [] : ['AOPS_PG_URL is required.']
  return {
    authRequired: false,
    configOk: errors.length === 0,
    storage: { envPath: null, envExists: false, repoDialect: runtime.repoDialect, repoUrlSource: runtime.repoUrlSource, redactedRepoUrl: admin.effective.redactedRepoUrl ?? "" },
    auth: { provider: 'trusted-local' as const, loginSupported: false, storagePolicyOk: true, adminKeyConfigured: false, firstAdminState: 'not-applicable' as const, userCount: null, adminUserCount: null },
    env: { hasPgUrl: Boolean(runtime.repoUrl) },
    errors,
    warnings: [],
  }
}

import { getResolvedAopsServerRuntimeConfig, testRuntimeConfigAdminTarget } from '$lib/server/aops-runtime-config'

export function toSafeErrorMessage(_error: unknown, fallback = "PostgreSQL status probe failed."): string {
  return fallback
}

export async function getDbAdminStatus() {
  const runtime = getResolvedAopsServerRuntimeConfig()
  if (!runtime.repoUrl) {
    return {
      checkedAt: new Date().toISOString(),
      env: { repoUrlEnv: 'AOPS_PG_URL' as const, repoUrlPresent: false },
      connection: { ok: false, databaseName: null, message: "AOPS_PG_URL is required.", redactedUrl: null },
      schema: { verificationLevel: 'sentinel-relations-only' as const, ready: false, sentinelsPresent: false, configuredRelationCount: 5, existingRelationCount: 0, existingRelations: [], missingRelations: ['projects', 'docman_documents', 'projectman_kanban_boards', 'chatv3-rooms', 'sys_event_stores'] },
      capabilities: { status: true, probe: true, reset: false, backup: false, restore: false },
    }
  }
  try {
    const probe = await testRuntimeConfigAdminTarget()
    return {
      checkedAt: new Date().toISOString(),
      env: { repoUrlEnv: 'AOPS_PG_URL' as const, repoUrlPresent: true },
      connection: { ...probe.connection, redactedUrl: probe.target.redactedRepoUrl },
      schema: probe.schema,
      capabilities: { status: true, probe: true, reset: false, backup: false, restore: false },
    }
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      env: { repoUrlEnv: 'AOPS_PG_URL' as const, repoUrlPresent: true },
      connection: { ok: false, databaseName: null, message: toSafeErrorMessage(error), redactedUrl: null },
      schema: { verificationLevel: 'sentinel-relations-only' as const, ready: false, sentinelsPresent: false, configuredRelationCount: 5, existingRelationCount: 0, existingRelations: [], missingRelations: ['projects', 'docman_documents', 'projectman_kanban_boards', 'chatv3-rooms', 'sys_event_stores'] },
      capabilities: { status: true, probe: true, reset: false, backup: false, restore: false },
    }
  }
}

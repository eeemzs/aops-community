import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

import { Effect } from 'effect'
import { createSyncLogger } from '@aopslab/xf-logger/sync'
import type { XfLogger } from '@aopslab/xf-logger'
import { drizzleDisconnect } from '@aopslab/xf-db-drizzle'
import { applyProjectmanPgSchema } from '../../../projectman-pg-bootstrap/src/index.js'

import type { ProjectmanKitEnvConfig } from '../config/config.js'
import { getProjectmanKitEnvConfig } from '../config/config.js'
import { createProjectmanKitWithEnv } from '../domain-services/unified.js'

export type ProjectmanTestKitContext = {
  env: ProjectmanKitEnvConfig
  tenantId: string
  logger?: XfLogger
  kit: ReturnType<typeof createProjectmanKitWithEnv>['kit']
  services: Awaited<ReturnType<ReturnType<typeof createProjectmanKitWithEnv>['kit']['createAll']>>
}

async function canConnectTcp(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (ok: boolean) => {
      try {
        socket.destroy()
      } catch {}
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

async function ensureProjectmanTables(repoUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: repoUrl })
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE')
    await pool.query('CREATE SCHEMA public')
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  } finally {
    await pool.end().catch(() => undefined)
  }

  await applyProjectmanPgSchema({ repoUrl })

  const fixturePool = new Pool({ connectionString: repoUrl })
  try {
    await fixturePool.query(`
      CREATE TABLE IF NOT EXISTS "projectman_planning_lineages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" text NOT NULL,
        "scopeId" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "operation" text NOT NULL,
        "sourceType" text NOT NULL,
        "sourceId" text NOT NULL,
        "targetType" text NOT NULL,
        "targetId" text NOT NULL,
        "copyDepth" text,
        "sourceProjectId" uuid,
        "targetProjectId" uuid,
        "details" jsonb,
        "createdBy" text,
        "updatedBy" text,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now()
      );
    `)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "planning_lineage_idx_tenant" ON "projectman_planning_lineages" ("tenantId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "planning_lineage_idx_scope" ON "projectman_planning_lineages" ("tenantId","scopeId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "planning_lineage_idx_project" ON "projectman_planning_lineages" ("tenantId","projectId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "planning_lineage_idx_operation" ON "projectman_planning_lineages" ("tenantId","operation");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "planning_lineage_idx_source" ON "projectman_planning_lineages" ("tenantId","sourceType","sourceId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "planning_lineage_idx_target" ON "projectman_planning_lineages" ("tenantId","targetType","targetId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "planning_lineage_idx_created_at" ON "projectman_planning_lineages" ("tenantId","createdAt");`)

    await fixturePool.query(`
      CREATE TABLE IF NOT EXISTS "projectman_histories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" text NOT NULL,
        "scopeId" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "boardId" uuid,
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "status" text NOT NULL,
        "tags" jsonb,
        "meta" jsonb,
        "createdBy" text,
        "updatedBy" text,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now()
      );
    `)
    await fixturePool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "history_project_slug_unique" ON "projectman_histories" ("tenantId","scopeId","projectId","slug");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "history_idx_tenant" ON "projectman_histories" ("tenantId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "history_idx_scope" ON "projectman_histories" ("tenantId","scopeId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "history_idx_project" ON "projectman_histories" ("tenantId","projectId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "history_idx_project_status" ON "projectman_histories" ("tenantId","projectId","status");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "history_idx_board" ON "projectman_histories" ("tenantId","boardId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "history_idx_created_at" ON "projectman_histories" ("tenantId","createdAt");`)

    await fixturePool.query(`
      CREATE TABLE IF NOT EXISTS "projectman_sprint_kanban_tasks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" text NOT NULL,
        "scopeId" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "sprintId" uuid NOT NULL,
        "kanbanTaskId" uuid NOT NULL,
        "createdBy" text,
        "updatedBy" text,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now()
      );
    `)
    await fixturePool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "projectman_sprint_kanban_task_unique" ON "projectman_sprint_kanban_tasks" ("tenantId","sprintId","kanbanTaskId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "projectman_sprint_kanban_task_idx_tenant" ON "projectman_sprint_kanban_tasks" ("tenantId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "projectman_sprint_kanban_task_idx_scope" ON "projectman_sprint_kanban_tasks" ("tenantId","scopeId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "projectman_sprint_kanban_task_idx_project" ON "projectman_sprint_kanban_tasks" ("tenantId","projectId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "projectman_sprint_kanban_task_idx_sprint" ON "projectman_sprint_kanban_tasks" ("tenantId","sprintId");`)
    await fixturePool.query(`CREATE INDEX IF NOT EXISTS "projectman_sprint_kanban_task_idx_task" ON "projectman_sprint_kanban_tasks" ("tenantId","kanbanTaskId");`)
  } finally {
    await fixturePool.end().catch(() => undefined)
  }
}

export async function tryCreateProjectmanTestKit(params: {
  label: string
}): Promise<{ ok: true; ctx: ProjectmanTestKitContext } | { ok: false; reason: string }> {
  let env: ProjectmanKitEnvConfig
  try {
    env = getProjectmanKitEnvConfig()
  } catch (err) {
    return { ok: false, reason: `skipped: missing AOPS_PG_URL (${err instanceof Error ? err.message : String(err)})` }
  }

  const repoUrl = env.kanbanBoardRepoUrl

  try {
    const url = new URL(repoUrl)
    const host = url.hostname
    const port = url.port ? Number(url.port) : 5432
    const ok = await canConnectTcp(host, port, 1_000)
    if (!ok) {
      return { ok: false, reason: `skipped: cannot reach postgres (${host}:${port})` }
    }
  } catch {
    // If URL parsing fails, still attempt kit init (it will throw with a clearer error).
  }

  await ensureProjectmanTables(repoUrl)

  const logger = await createSyncLogger({
    level: 'debug',
    base: { module: `projectman-dm::service-test::${params.label}` },
  })

  const tenantId = randomUUID()
  const { kit } = createProjectmanKitWithEnv({
    envConfig: env,
    baseContext: { tenantId, logger },
  })

  const services = await kit.createAll({ tenantId })

  return { ok: true, ctx: { env, tenantId, logger, kit, services } }
}

export async function cleanupProjectmanTenant(ctx: { kit: any; tenantId: string; logger?: XfLogger }): Promise<void> {
  const { kit, tenantId, logger } = ctx

  const repos = [
    ['projectmanEvent', await kit.getProjectmanEventRepository({ tenantId })],
    ['planningLineage', await kit.getPlanningLineageRepository({ tenantId })],
    ['kanbanTemplate', await kit.getKanbanTemplateRepository({ tenantId })],
    ['sprintKanbanTaskLink', await kit.getSprintKanbanTaskLinkRepository({ tenantId })],
    ['issueItem', await kit.getIssueItemRepository({ tenantId })],
    ['feedbackItem', await kit.getFeedbackItemRepository({ tenantId })],
    ['microTaskItem', await kit.getMicroTaskItemRepository({ tenantId })],
    ['sprintGroup', await kit.getSprintGroupRepository({ tenantId })],
    ['sprint', await kit.getSprintRepository({ tenantId })],
    ['kanbanTask', await kit.getKanbanTaskRepository({ tenantId })],
    ['kanbanBoardColumn', await kit.getKanbanBoardColumnRepository({ tenantId })],
    ['kanbanColumn', await kit.getKanbanColumnRepository({ tenantId })],
    ['kanbanBoard', await kit.getKanbanBoardRepository({ tenantId })],
  ] as const

  for (const [name, repo] of repos) {
    const deleted = await Effect.runPromise(repo.cleanupAll())
    logger?.info({ deleted, tenantId }, `[projectman-dm:test] cleanupAll(${name})`)
  }
}

export async function shutdownProjectmanTestKit(ctx?: { kit?: any }): Promise<void> {
  try {
    ctx?.kit?.reset?.({ services: true, repositories: true })
  } catch {}
  await drizzleDisconnect()
}

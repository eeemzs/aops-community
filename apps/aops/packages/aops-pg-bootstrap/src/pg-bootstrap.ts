import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import { Client } from 'pg'
import { config as loadDotEnv } from 'dotenv'

import {
  AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
  runAopsPgBootstrapManifest,
  type AopsPgBootstrapAdapter,
  type AopsPgBootstrapOperation,
} from './manifest.js'

export type { AopsPgBootstrapOperation } from './manifest.js'

const nodeRequire = createRequire(import.meta.url)
const LOOP_RUNNER_V2_WORKER_LEASE_TABLE = 'loop-runner-v2-worker-leases'
const REQUIRED_AOPS_REPAIR_SOURCE_TABLES = ['agent-runs'] as const

type AopsAdditiveSchemaRepair = {
  kind: 'table' | 'index'
  name: string
  exists: (client: Client) => Promise<boolean>
  sql: string
}

let envLoaded = false

function loadBootstrapEnv(workspaceRoot?: string): void {
  if (envLoaded) return
  envLoaded = true

  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    path.resolve(process.cwd(), '.env'),
    workspaceRoot ? path.resolve(workspaceRoot, 'apps/aops-server/.env') : undefined,
    workspaceRoot ? path.resolve(workspaceRoot, '.env') : undefined,
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    loadDotEnv({ path: candidate, quiet: true })
  }
}

function resolveAopsRepoUrl(repoUrl?: string): string {
  return (
    repoUrl ||
    process.env.AOPS_PG_URL ||
    process.env.AOPS_REPO_URL ||
    process.env.DEV_PG_URL ||
    process.env.POSTGRES_URL_LOCAL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/aops'
  )
}

function resolveAuthRepoUrl(repoUrl?: string): string {
  return (
    repoUrl ||
    process.env.AUTHV2_REPO_URL ||
    process.env.AOPS_PG_URL ||
    process.env.AOPS_REPO_URL ||
    process.env.DEV_PG_URL ||
    process.env.POSTGRES_URL_LOCAL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/aops'
  )
}

async function withPgClient<T>(repoUrl: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: repoUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function hasTable(client: Client, tableName: string): Promise<boolean> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName],
  )
  return result.rows.length > 0
}

async function hasIndex(client: Client, indexName: string): Promise<boolean> {
  const result = await client.query<{ indexname: string }>(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = $1`,
    [indexName],
  )
  return result.rows.length > 0
}

function buildAopsAdditiveSchemaRepairs(): AopsAdditiveSchemaRepair[] {
  return [
    {
      kind: 'table',
      name: LOOP_RUNNER_V2_WORKER_LEASE_TABLE,
      exists: (client) => hasTable(client, LOOP_RUNNER_V2_WORKER_LEASE_TABLE),
      sql: `CREATE TABLE IF NOT EXISTS public."loop-runner-v2-worker-leases" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" text NOT NULL,
        "scopeId" uuid NOT NULL,
        "agentRunId" uuid NOT NULL REFERENCES public."agent-runs"("id") ON DELETE cascade,
        "runId" text NOT NULL,
        "sliceId" text NOT NULL,
        "leaseId" text NOT NULL,
        "workerId" text NOT NULL,
        "runtimeKey" text NOT NULL,
        "state" text NOT NULL,
        "permissions" jsonb NOT NULL,
        "claimedAt" timestamp with time zone NOT NULL,
        "lastHeartbeatAt" timestamp with time zone NOT NULL,
        "expiresAt" timestamp with time zone NOT NULL,
        "releasedAt" timestamp with time zone,
        "heartbeatCount" integer NOT NULL DEFAULT 0,
        "claimIdempotencyKey" text NOT NULL,
        "lastHeartbeatIdempotencyKey" text,
        "meta" jsonb,
        "createdAt" timestamp with time zone DEFAULT now(),
        "updatedAt" timestamp with time zone DEFAULT now()
      )`,
    },
    {
      kind: 'index',
      name: 'loop_runner_v2_worker_lease_unique_lease',
      exists: (client) => hasIndex(client, 'loop_runner_v2_worker_lease_unique_lease'),
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "loop_runner_v2_worker_lease_unique_lease"
        ON public."loop-runner-v2-worker-leases" ("tenantId", "agentRunId", "leaseId")`,
    },
    {
      kind: 'index',
      name: 'loop_runner_v2_worker_lease_unique_claim_idempotency',
      exists: (client) => hasIndex(client, 'loop_runner_v2_worker_lease_unique_claim_idempotency'),
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "loop_runner_v2_worker_lease_unique_claim_idempotency"
        ON public."loop-runner-v2-worker-leases" ("tenantId", "agentRunId", "claimIdempotencyKey")`,
    },
    {
      kind: 'index',
      name: 'loop_runner_v2_worker_lease_active_slice_unique',
      exists: (client) => hasIndex(client, 'loop_runner_v2_worker_lease_active_slice_unique'),
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "loop_runner_v2_worker_lease_active_slice_unique"
        ON public."loop-runner-v2-worker-leases" ("tenantId", "agentRunId", "sliceId")
        WHERE "state" in ('claimed', 'active', 'renewed')`,
    },
    {
      kind: 'index',
      name: 'loop_runner_v2_worker_lease_idx_scope',
      exists: (client) => hasIndex(client, 'loop_runner_v2_worker_lease_idx_scope'),
      sql: `CREATE INDEX IF NOT EXISTS "loop_runner_v2_worker_lease_idx_scope"
        ON public."loop-runner-v2-worker-leases" ("tenantId", "scopeId")`,
    },
    {
      kind: 'index',
      name: 'loop_runner_v2_worker_lease_idx_run',
      exists: (client) => hasIndex(client, 'loop_runner_v2_worker_lease_idx_run'),
      sql: `CREATE INDEX IF NOT EXISTS "loop_runner_v2_worker_lease_idx_run"
        ON public."loop-runner-v2-worker-leases" ("tenantId", "runId")`,
    },
    {
      kind: 'index',
      name: 'loop_runner_v2_worker_lease_idx_agent_run',
      exists: (client) => hasIndex(client, 'loop_runner_v2_worker_lease_idx_agent_run'),
      sql: `CREATE INDEX IF NOT EXISTS "loop_runner_v2_worker_lease_idx_agent_run"
        ON public."loop-runner-v2-worker-leases" ("tenantId", "agentRunId")`,
    },
    {
      kind: 'index',
      name: 'loop_runner_v2_worker_lease_idx_worker',
      exists: (client) => hasIndex(client, 'loop_runner_v2_worker_lease_idx_worker'),
      sql: `CREATE INDEX IF NOT EXISTS "loop_runner_v2_worker_lease_idx_worker"
        ON public."loop-runner-v2-worker-leases" ("tenantId", "agentRunId", "workerId")`,
    },
    {
      kind: 'index',
      name: 'loop_runner_v2_worker_lease_idx_expiry',
      exists: (client) => hasIndex(client, 'loop_runner_v2_worker_lease_idx_expiry'),
      sql: `CREATE INDEX IF NOT EXISTS "loop_runner_v2_worker_lease_idx_expiry"
        ON public."loop-runner-v2-worker-leases" ("tenantId", "agentRunId", "expiresAt")`,
    },
  ]
}

async function applyAopsAdditiveSchemaRepairs(repoUrl: string, logs: string[]): Promise<void> {
  await withPgClient(repoUrl, async (client) => {
    const requiredTables = await Promise.all(REQUIRED_AOPS_REPAIR_SOURCE_TABLES.map((tableName) => hasTable(client, tableName)))
    if (requiredTables.includes(false)) {
      logs.push('Skipping AOPS additive schema repairs because prerequisite Tasker runner tables are not present yet.')
      return
    }

    const repairs = buildAopsAdditiveSchemaRepairs()
    const pending: AopsAdditiveSchemaRepair[] = []
    for (const repair of repairs) {
      if (!(await repair.exists(client))) pending.push(repair)
    }
    if (pending.length === 0) return

    logs.push(
      `Applying ${String(pending.length)} additive AOPS schema repair(s): ${pending
        .map((repair) => `${repair.kind}:${repair.name}`)
        .join(', ')}`,
    )
    await client.query('BEGIN')
    try {
      for (const repair of pending) {
        await client.query(repair.sql)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    }
  })
}

export type AopsPgBootstrapPaths = {
  workspaceRoot: string
  aopsConfigPath: string
  aopsConfigExists: boolean
  authConfigPath: string
  authConfigExists: boolean
}

export type AopsPgBootstrapTarget = 'aops' | 'auth' | 'both'

export type AopsPgBootstrapStatus = AopsPgBootstrapPaths & {
  ownerPackage: '@aops/pg-bootstrap'
  cliCommand: 'node packages/aops-pg-bootstrap/dist/cli.js'
  strategy: 'drizzle-kit-cli-adapter'
  finalized: true
  transitional: false
  transitionalReason: null
  supportedOperations: AopsPgBootstrapOperation[]
  supportedTargets: AopsPgBootstrapTarget[]
  drizzleKitPackageEntryPath: string | null
  drizzleKitPackageResolved: boolean
  drizzleKitBinPath: string | null
  drizzleKitBinResolved: boolean
}

export function resolveAopsPgBootstrapPaths(workspaceRoot: string): AopsPgBootstrapPaths {
  const aopsConfigPath = path.join(workspaceRoot, 'apps/aops-server/drizzle.aops.config.ts')
  const authConfigPath = path.join(workspaceRoot, 'apps/aops-server/drizzle.authv2.config.ts')

  return {
    workspaceRoot,
    aopsConfigPath,
    aopsConfigExists: existsSync(aopsConfigPath),
    authConfigPath,
    authConfigExists: existsSync(authConfigPath),
  }
}

function tryResolveDrizzleKitPackageEntry(): string | null {
  try {
    return nodeRequire.resolve('drizzle-kit')
  } catch {
    return null
  }
}

function resolveDrizzleKitRuntimeStatus(): Pick<
  AopsPgBootstrapStatus,
  | 'ownerPackage'
  | 'cliCommand'
  | 'strategy'
  | 'finalized'
  | 'transitional'
  | 'transitionalReason'
  | 'supportedOperations'
  | 'supportedTargets'
  | 'drizzleKitPackageEntryPath'
  | 'drizzleKitPackageResolved'
  | 'drizzleKitBinPath'
  | 'drizzleKitBinResolved'
> {
  const packageEntry = tryResolveDrizzleKitPackageEntry()

  if (!packageEntry) {
    return {
      ownerPackage: '@aops/pg-bootstrap',
      cliCommand: 'node packages/aops-pg-bootstrap/dist/cli.js',
      strategy: 'drizzle-kit-cli-adapter',
      finalized: true,
      transitional: false,
      transitionalReason: null,
      supportedOperations: ['push', 'generate', 'migrate'],
      supportedTargets: ['aops', 'auth', 'both'],
      drizzleKitPackageEntryPath: null,
      drizzleKitPackageResolved: false,
      drizzleKitBinPath: null,
      drizzleKitBinResolved: false,
    }
  }

  const packageRoot = path.dirname(packageEntry)
  const candidates = ['bin.cjs', 'bin.js']

  for (const candidate of candidates) {
    const candidatePath = path.join(packageRoot, candidate)
    if (existsSync(candidatePath)) {
      return {
        ownerPackage: '@aops/pg-bootstrap',
        cliCommand: 'node packages/aops-pg-bootstrap/dist/cli.js',
        strategy: 'drizzle-kit-cli-adapter',
        finalized: true,
        transitional: false,
        transitionalReason: null,
        supportedOperations: ['push', 'generate', 'migrate'],
        supportedTargets: ['aops', 'auth', 'both'],
        drizzleKitPackageEntryPath: packageEntry,
        drizzleKitPackageResolved: true,
        drizzleKitBinPath: candidatePath,
        drizzleKitBinResolved: true,
      }
    }
  }

  return {
    ownerPackage: '@aops/pg-bootstrap',
    cliCommand: 'node packages/aops-pg-bootstrap/dist/cli.js',
    strategy: 'drizzle-kit-cli-adapter',
    finalized: true,
    transitional: false,
    transitionalReason: null,
    supportedOperations: ['push', 'generate', 'migrate'],
    supportedTargets: ['aops', 'auth', 'both'],
    drizzleKitPackageEntryPath: packageEntry,
    drizzleKitPackageResolved: true,
    drizzleKitBinPath: null,
    drizzleKitBinResolved: false,
  }
}

export function inspectAopsPgBootstrap(workspaceRoot: string): AopsPgBootstrapStatus {
  return {
    ...resolveAopsPgBootstrapPaths(workspaceRoot),
    ...resolveDrizzleKitRuntimeStatus(),
  }
}

function resolveDrizzleKitBin(): string {
  const runtime = resolveDrizzleKitRuntimeStatus()
  if (!runtime.drizzleKitPackageResolved) {
    throw new Error('drizzle_kit_package_not_resolved')
  }
  if (!runtime.drizzleKitBinResolved || !runtime.drizzleKitBinPath) {
    throw new Error('drizzle_kit_bin_not_found')
  }
  return runtime.drizzleKitBinPath
}

async function runDrizzleKitCommand(params: {
  operation: AopsPgBootstrapOperation
  configPath: string
  cwd: string
  env: NodeJS.ProcessEnv
  label: string
  logs: string[]
}): Promise<void> {
  const drizzleKitBin = resolveDrizzleKitBin()

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [drizzleKitBin, params.operation, '--config', params.configPath], {
      cwd: params.cwd,
      env: { ...process.env, ...params.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const pushLines = (chunk: Buffer, streamLabel: string) => {
      const text = chunk.toString('utf-8')
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => params.logs.push(`[${params.label}/${streamLabel}] ${line}`))
    }

    child.stdout.on('data', (chunk) => pushLines(Buffer.from(chunk), 'stdout'))
    child.stderr.on('data', (chunk) => pushLines(Buffer.from(chunk), 'stderr'))
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${params.label} command exited with code ${String(code ?? 'unknown')}`))
    })
  })
}

async function runAopsDrizzleKitTarget(params: {
  operation: AopsPgBootstrapOperation
  paths: AopsPgBootstrapPaths
  repoUrl?: string
  logs: string[]
  includePrivateRepairs: boolean
}): Promise<void> {
  if (!params.paths.aopsConfigExists) {
    throw new Error(`aops_pg_bootstrap_config_missing:${params.paths.aopsConfigPath}`)
  }

  const sharedEnv: NodeJS.ProcessEnv = {}
  if (params.repoUrl) {
    sharedEnv.AOPS_REPO_URL = params.repoUrl
    sharedEnv.AOPS_PG_URL = params.repoUrl
  }

  params.logs.push(`Running AOPS PostgreSQL ${params.operation} via owned bootstrap adapter...`)
  await runDrizzleKitCommand({
    operation: params.operation,
    configPath: params.paths.aopsConfigPath,
    cwd: params.paths.workspaceRoot,
    env: sharedEnv,
    label: 'aops-pg-bootstrap',
    logs: params.logs,
  })

  if (params.operation === 'push' && params.includePrivateRepairs) {
    await applyAopsAdditiveSchemaRepairs(resolveAopsRepoUrl(params.repoUrl), params.logs)
  }
}

export function createAopsWorkspacePgBootstrapAdapter(
  options: { includePrivateRepairs?: boolean } = {},
): AopsPgBootstrapAdapter {
  return {
    id: 'workspace-drizzle',
    async run(context) {
      const paths = resolveAopsPgBootstrapPaths(context.workspaceRoot)
      if (path.resolve(context.resourcePath) !== path.resolve(paths.aopsConfigPath)) {
        throw new Error(
          `aops_pg_bootstrap_workspace_config_mismatch:expected=${paths.aopsConfigPath}:actual=${context.resourcePath}`,
        )
      }
      await runAopsDrizzleKitTarget({
        operation: context.operation,
        paths,
        repoUrl: context.repoUrl,
        logs: context.logs,
        includePrivateRepairs: options.includePrivateRepairs === true,
      })
    },
  }
}

export type ApplyAuthV2PgSchema = (params: {
  repoUrl: string
  logs?: string[]
}) => Promise<unknown>

export function createAuthV2PgBootstrapAdapter(
  applyAuthV2PgSchema: ApplyAuthV2PgSchema,
): AopsPgBootstrapAdapter {
  if (typeof applyAuthV2PgSchema !== 'function') {
    throw new Error('aops_auth_pg_bootstrap_apply_function_required')
  }
  return {
    id: 'authv2',
    async run(context) {
      if (context.operation !== 'push') {
        throw new Error(`aops_auth_pg_bootstrap_operation_domain_owned:${context.operation}`)
      }
      context.logs.push('Running AuthV2 PostgreSQL push via injected domain-owned bootstrap adapter...')
      await applyAuthV2PgSchema({
        repoUrl: resolveAuthRepoUrl(context.repoUrl),
        logs: context.logs,
      })
    },
  }
}

function targetIdsForLegacyTarget(target: AopsPgBootstrapTarget): readonly string[] {
  if (target === 'aops') return ['aops']
  if (target === 'auth') return ['auth']
  if (target === 'both') return ['aops', 'auth']
  throw new Error(`aops_pg_bootstrap_target_unknown:${String(target)}`)
}

export async function runAopsPgBootstrapOperation(params: {
  operation: AopsPgBootstrapOperation
  workspaceRoot: string
  repoUrl?: string
  target?: AopsPgBootstrapTarget
  adapters?: readonly AopsPgBootstrapAdapter[]
  includePrivateRepairs?: boolean
  logs?: string[]
}): Promise<AopsPgBootstrapPaths> {
  const logs = params.logs ?? []
  const target = params.target ?? 'aops'
  const paths = resolveAopsPgBootstrapPaths(params.workspaceRoot)
  loadBootstrapEnv(paths.workspaceRoot)
  await runAopsPgBootstrapManifest({
    manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
    adapters: [
      createAopsWorkspacePgBootstrapAdapter({
        includePrivateRepairs: params.includePrivateRepairs === true,
      }),
      ...(params.adapters ?? []),
    ],
    operation: params.operation,
    targetIds: targetIdsForLegacyTarget(target),
    resourceRoot: paths.workspaceRoot,
    workspaceRoot: paths.workspaceRoot,
    repoUrl: params.repoUrl,
    logs,
  })

  return paths
}

export async function applyAopsPgSchema(params: {
  workspaceRoot: string
  repoUrl: string
  includeAuthTables?: boolean
  adapters?: readonly AopsPgBootstrapAdapter[]
  includePrivateRepairs?: boolean
  logs?: string[]
}): Promise<AopsPgBootstrapPaths> {
  const includeAuthTables = params.includeAuthTables === true
  return runAopsPgBootstrapOperation({
    operation: 'push',
    workspaceRoot: params.workspaceRoot,
    repoUrl: params.repoUrl,
    target: includeAuthTables ? 'both' : 'aops',
    adapters: params.adapters,
    includePrivateRepairs: params.includePrivateRepairs,
    logs: params.logs,
  })
}

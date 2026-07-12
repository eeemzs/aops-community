import { DEFAULT_TENANT_AS_UUID_STRING } from '@aopslab/xf-core'
import { z } from 'zod'

export const EnvSchema = z.object({
  TENANT_ID: z.string().uuid().optional(),
  LOG_LEVEL: z.string().optional(),
  AOPS_REPO_URL: z.string().min(1).optional(),
  AOPS_SQLITE_URL: z.string().min(1).optional(),
  AOPS_PG_URL: z.string().min(1).optional(),
  PROJECTMAN_PG_URL: z.string().min(1).optional(),
  PROJECTMAN_SQLITE_URL: z.string().min(1).optional(),
  PROJECTMAN_REPO_URL: z.string().min(1).optional(),
  KANBAN_BOARD_REPO_URL: z.string().min(1).optional(),
  KANBAN_COLUMN_REPO_URL: z.string().min(1).optional(),
  KANBAN_BOARD_COLUMN_REPO_URL: z.string().min(1).optional(),
  KANBAN_TASK_REPO_URL: z.string().min(1).optional(),
  SPRINT_REPO_URL: z.string().min(1).optional(),
  SPRINT_GROUP_REPO_URL: z.string().min(1).optional(),
  MICRO_TASK_ITEM_REPO_URL: z.string().min(1).optional(),
  ISSUE_ITEM_REPO_URL: z.string().min(1).optional(),
  FEEDBACK_ITEM_REPO_URL: z.string().min(1).optional(),
  REVIEW_REQUEST_REPO_URL: z.string().min(1).optional(),
  HISTORY_REPO_URL: z.string().min(1).optional(),
  PLANNING_LINEAGE_REPO_URL: z.string().min(1).optional(),
  SPRINT_KANBAN_TASK_REPO_URL: z.string().min(1).optional(),
  KANBAN_TEMPLATE_REPO_URL: z.string().min(1).optional(),
  PROJECTMAN_EVENT_REPO_URL: z.string().min(1).optional(),
})

export type ProjectmanKitEnvConfig = {
  tenantId: string
  logLevel: string
  kanbanBoardRepoUrl: string
  kanbanColumnRepoUrl: string
  kanbanBoardColumnRepoUrl: string
  kanbanTaskRepoUrl: string
  sprintRepoUrl: string
  sprintGroupRepoUrl: string
  microTaskItemRepoUrl: string
  issueItemRepoUrl: string
  feedbackItemRepoUrl: string
  reviewRequestRepoUrl: string
  historyRepoUrl: string
  planningLineageRepoUrl: string
  sprintKanbanTaskRepoUrl: string
  kanbanTemplateRepoUrl: string
  projectmanEventRepoUrl: string
}

export type ProjectmanKitEnvEntry = {
  label: string
  config: ProjectmanKitEnvConfig
}

const PROJECTMAN_ENV_KEYS = ['envDefault'] as const
export type ProjectmanKitEnvKey = (typeof PROJECTMAN_ENV_KEYS)[number]
export const DEFAULT_PROJECTMAN_ENV_KEY: ProjectmanKitEnvKey = 'envDefault'

type NormalizedProjectmanEnv = Partial<Record<keyof z.infer<typeof EnvSchema>, string>>

function resolveRepoUrl(params: { explicit?: string; fallback?: string; label: string }): string {
  const value = params.explicit ?? params.fallback
  if (!value) {
    throw new Error(`Missing required configuration: ${params.label}`)
  }
  return value
}

function normalizeOptionalEnvString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeProjectmanProcessEnv(processEnv: NodeJS.ProcessEnv): NormalizedProjectmanEnv {
  const normalizedEntries = Object.entries(processEnv)
    .map(([key, value]) => [key, normalizeOptionalEnvString(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)

  return Object.fromEntries(normalizedEntries) as NormalizedProjectmanEnv
}

function buildEnvConfigurations(): Record<ProjectmanKitEnvKey, ProjectmanKitEnvEntry> {
  const normalizedEnv = normalizeProjectmanProcessEnv(process.env)
  const parsed = EnvSchema.safeParse(normalizedEnv)
  const e = (parsed.success ? parsed.data : normalizedEnv) as NormalizedProjectmanEnv

  const parsedTenantId = z.string().uuid().safeParse(e.TENANT_ID)
  const defaultTenantId = parsedTenantId.success ? parsedTenantId.data : DEFAULT_TENANT_AS_UUID_STRING
  const defaultLogLevel = process.env.NODE_ENV === 'development' ? 'debug' : e.LOG_LEVEL ?? 'info'
  const sharedRepoUrl =
    e.PROJECTMAN_REPO_URL ??
    e.PROJECTMAN_SQLITE_URL ??
    e.PROJECTMAN_PG_URL ??
    e.AOPS_REPO_URL ??
    e.AOPS_SQLITE_URL ??
    e.AOPS_PG_URL

  return {
    envDefault: {
      label: 'env-default (process.env)',
      config: {
        tenantId: defaultTenantId,
        logLevel: defaultLogLevel,
        kanbanBoardRepoUrl: resolveRepoUrl({
          explicit: e.KANBAN_BOARD_REPO_URL, fallback: sharedRepoUrl,
          label: 'KANBAN_BOARD_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        kanbanColumnRepoUrl: resolveRepoUrl({
          explicit: e.KANBAN_COLUMN_REPO_URL, fallback: sharedRepoUrl,
          label: 'KANBAN_COLUMN_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        kanbanBoardColumnRepoUrl: resolveRepoUrl({
          explicit: e.KANBAN_BOARD_COLUMN_REPO_URL, fallback: sharedRepoUrl,
          label: 'KANBAN_BOARD_COLUMN_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        kanbanTaskRepoUrl: resolveRepoUrl({
          explicit: e.KANBAN_TASK_REPO_URL, fallback: sharedRepoUrl,
          label: 'KANBAN_TASK_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        sprintRepoUrl: resolveRepoUrl({
          explicit: e.SPRINT_REPO_URL, fallback: sharedRepoUrl,
          label: 'SPRINT_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        sprintGroupRepoUrl: resolveRepoUrl({
          explicit: e.SPRINT_GROUP_REPO_URL, fallback: sharedRepoUrl,
          label: 'SPRINT_GROUP_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        microTaskItemRepoUrl: resolveRepoUrl({
          explicit: e.MICRO_TASK_ITEM_REPO_URL, fallback: sharedRepoUrl,
          label: 'MICRO_TASK_ITEM_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        issueItemRepoUrl: resolveRepoUrl({
          explicit: e.ISSUE_ITEM_REPO_URL, fallback: sharedRepoUrl,
          label: 'ISSUE_ITEM_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        feedbackItemRepoUrl: resolveRepoUrl({
          explicit: e.FEEDBACK_ITEM_REPO_URL, fallback: sharedRepoUrl,
          label: 'FEEDBACK_ITEM_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        reviewRequestRepoUrl: resolveRepoUrl({
          explicit: e.REVIEW_REQUEST_REPO_URL, fallback: sharedRepoUrl,
          label: 'REVIEW_REQUEST_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        historyRepoUrl: resolveRepoUrl({
          explicit: e.HISTORY_REPO_URL, fallback: sharedRepoUrl,
          label: 'HISTORY_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        planningLineageRepoUrl: resolveRepoUrl({
          explicit: e.PLANNING_LINEAGE_REPO_URL, fallback: sharedRepoUrl,
          label: 'PLANNING_LINEAGE_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        sprintKanbanTaskRepoUrl: resolveRepoUrl({
          explicit: e.SPRINT_KANBAN_TASK_REPO_URL, fallback: sharedRepoUrl,
          label: 'SPRINT_KANBAN_TASK_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        kanbanTemplateRepoUrl: resolveRepoUrl({
          explicit: e.KANBAN_TEMPLATE_REPO_URL, fallback: sharedRepoUrl,
          label: 'KANBAN_TEMPLATE_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
        projectmanEventRepoUrl: resolveRepoUrl({
          explicit: e.PROJECTMAN_EVENT_REPO_URL, fallback: sharedRepoUrl,
          label: 'PROJECTMAN_EVENT_REPO_URL (or PROJECTMAN_REPO_URL or PROJECTMAN_SQLITE_URL or PROJECTMAN_PG_URL or AOPS_REPO_URL or AOPS_SQLITE_URL or AOPS_PG_URL)',
        }),
      },
    },
  }
}

let cachedEnvConfigurations: Record<ProjectmanKitEnvKey, ProjectmanKitEnvEntry> | null = null

function getEnvConfigurations(): Record<ProjectmanKitEnvKey, ProjectmanKitEnvEntry> {
  if (!cachedEnvConfigurations) {
    cachedEnvConfigurations = buildEnvConfigurations()
  }
  return cachedEnvConfigurations
}

function getProjectmanKitEnvMatrixInternal(): Array<{ key: ProjectmanKitEnvKey } & ProjectmanKitEnvEntry> {
  const envConfigurations = getEnvConfigurations()
  return (Object.entries(envConfigurations) as Array<[ProjectmanKitEnvKey, ProjectmanKitEnvEntry]>).map(([key, entry]) => ({
    key,
    ...entry,
  }))
}

function createEnvProxy(): ProjectmanKitEnvConfig {
  return new Proxy({} as ProjectmanKitEnvConfig, {
    get(_target, prop) {
      return (getProjectmanKitEnvConfig() as any)[prop as keyof ProjectmanKitEnvConfig]
    },
    ownKeys() {
      return Reflect.ownKeys(getProjectmanKitEnvConfig())
    },
    getOwnPropertyDescriptor(_target, prop) {
      const cfg = getProjectmanKitEnvConfig()
      if (prop in cfg) {
        return { enumerable: true, configurable: true, value: (cfg as any)[prop as keyof ProjectmanKitEnvConfig] }
      }
      return undefined
    },
  })
}

function createEnvMatrixProxy(): Array<{ key: ProjectmanKitEnvKey } & ProjectmanKitEnvEntry> {
  return new Proxy([] as Array<{ key: ProjectmanKitEnvKey } & ProjectmanKitEnvEntry>, {
    get(_target, prop) {
      return Reflect.get(getProjectmanKitEnvMatrixInternal(), prop)
    },
    ownKeys() {
      return Reflect.ownKeys(getProjectmanKitEnvMatrixInternal())
    },
    getOwnPropertyDescriptor(_target, prop) {
      const matrix = getProjectmanKitEnvMatrixInternal()
      const value = (matrix as any)[prop]
      if (value === undefined) return undefined
      return { enumerable: true, configurable: true, value }
    },
  })
}

export const env: ProjectmanKitEnvConfig = createEnvProxy()

export const projectmanEnvMatrix: Array<{ key: ProjectmanKitEnvKey } & ProjectmanKitEnvEntry> = createEnvMatrixProxy()

export function getProjectmanKitEnvConfig(key: ProjectmanKitEnvKey = DEFAULT_PROJECTMAN_ENV_KEY): ProjectmanKitEnvConfig {
  return getEnvConfigurations()[key].config
}

export function clearProjectmanKitEnvConfigCache(): void {
  cachedEnvConfigurations = null
}

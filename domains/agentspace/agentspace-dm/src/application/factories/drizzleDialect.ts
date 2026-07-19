import { createRepositoryFactory } from '@aopslab/xf-dm'
import type { IUnitOfWork, RepositoryConfig } from '@aopslab/xf-db'
import { DrizzleUnitOfWork, DrizzleUnitOfWorkSqlite } from '@aopslab/xf-db-drizzle'
import type { XfLogger } from '@aopslab/xf-logger'

export type AgentspaceDrizzleDialect = 'pg' | 'sqlite'

type DrizzleRepositoryCtor<TPort> = new (args: {
  repositoryConfig: RepositoryConfig
  logger?: XfLogger
}) => TPort

export function inferDrizzleDialectFromRepositoryConfig(
  repositoryConfig?: Pick<RepositoryConfig, 'drizzleDialect' | 'url'>,
): AgentspaceDrizzleDialect {
  const explicit = repositoryConfig?.drizzleDialect
  if (explicit === 'sqlite') return 'sqlite'
  if (explicit === 'pg') return 'pg'

  const value = (repositoryConfig?.url ?? '').trim().toLowerCase()
  if (!value) return 'pg'
  if (value === ':memory:') return 'sqlite'
  if (value.startsWith('sqlite:') || value.startsWith('file:')) return 'sqlite'
  if (value.endsWith('.db') || value.endsWith('.sqlite') || value.endsWith('.sqlite3')) return 'sqlite'
  return 'pg'
}

export function createAgentspaceDrizzleRepositoryFactory<TPort>(params: {
  moduleName: string
  pgRepo: DrizzleRepositoryCtor<TPort>
  sqliteRepo: DrizzleRepositoryCtor<TPort>
}) {
  const pgFactory = createRepositoryFactory<TPort>({
    moduleName: params.moduleName,
    mongoRepo: undefined,
    drizzleRepo: params.pgRepo,
  })

  const sqliteFactory = createRepositoryFactory<TPort>({
    moduleName: `${params.moduleName}Sqlite`,
    mongoRepo: undefined,
    drizzleRepo: params.sqliteRepo,
  })

  return {
    create(createParams: Parameters<typeof pgFactory.create>[0]) {
      const dialect = inferDrizzleDialectFromRepositoryConfig(createParams.repositoryConfig)
      const normalizedCreateParams: Parameters<typeof pgFactory.create>[0] = {
        ...createParams,
        repositoryConfig: {
          ...createParams.repositoryConfig,
          repositoryType: 'drizzle',
          drizzleDialect: dialect,
        },
      }

      return (dialect === 'sqlite' ? sqliteFactory : pgFactory).create(normalizedCreateParams)
    },
  }
}

export function createAgentspaceDrizzleUnitOfWork(
  repositoryConfig?: Pick<RepositoryConfig, 'drizzleDialect' | 'drizzleSqliteDriver' | 'url'>,
): IUnitOfWork {
  const dialect = inferDrizzleDialectFromRepositoryConfig(repositoryConfig)
  return dialect === 'sqlite'
    ? new DrizzleUnitOfWorkSqlite({
      uri: repositoryConfig?.url,
      driver: repositoryConfig?.drizzleSqliteDriver,
    })
    : new DrizzleUnitOfWork()
}

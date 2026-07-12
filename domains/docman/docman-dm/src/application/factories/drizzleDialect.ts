import { createRepositoryFactory } from '@aopslab/xf-dm'
import type { RepositoryConfig } from '@aopslab/xf-db'
import type { XfLogger } from '@aopslab/xf-logger'

export type DocmanDrizzleDialect = 'pg' | 'sqlite'

type DrizzleRepositoryCtor<TPort> = new (args: {
  repositoryConfig: RepositoryConfig
  logger?: XfLogger
}) => TPort

export function inferDrizzleDialectFromRepositoryConfig(
  repositoryConfig?: Pick<RepositoryConfig, 'drizzleDialect' | 'url'>,
): DocmanDrizzleDialect {
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

export function createDocmanDrizzleRepositoryFactory<TPort>(params: {
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
      return (dialect === 'sqlite' ? sqliteFactory : pgFactory).create(createParams)
    },
  }
}

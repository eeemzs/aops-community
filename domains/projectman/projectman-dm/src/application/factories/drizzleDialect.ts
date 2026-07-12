import type { RepositoryConfig } from '@aopslab/xf-db'

export type ProjectmanDrizzleDialect = 'pg' | 'sqlite'

export function inferDrizzleDialectFromRepositoryConfig(
  repositoryConfig?: Pick<RepositoryConfig, 'drizzleDialect' | 'url'>,
): ProjectmanDrizzleDialect {
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

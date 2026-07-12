import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'

export const artifactTableSqlite = sqliteTable(
  'artifacts',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    artifactType: text().notNull(),
    label: text(),
    storagePath: text().notNull(),
    mimeType: text(),
    sizeBytes: integer(),
    hash: text(),
    meta: text({ mode: 'json' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('artifact_idx_tenant').on(t.tenantId),
    
    index('artifact_idx_scope_created').on(t.tenantId, t.scopeId, t.createdAt),
  ]
)

export type IdbArtifactDrizzleSqlite = InferSelectModel<typeof artifactTableSqlite>;
export type ArtifactColumnsDrizzleSqlite = keyof IdbArtifactDrizzleSqlite;

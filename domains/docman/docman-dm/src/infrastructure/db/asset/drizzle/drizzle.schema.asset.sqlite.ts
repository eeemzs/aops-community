import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const assetTableSqlite = sqliteTable(
  domainTableName('assets'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    assetUid: text().notNull(),
    kind: text().notNull(),
    title: text(),
    slug: text(),
    altText: text(),
    currentVersionId: text(),
    meta: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('asset_uid_unique').on(t.tenantId, t.scopeId, t.assetUid),
    index('asset_idx_tenant').on(t.tenantId),
    index('asset_idx_scope').on(t.tenantId, t.scopeId),
    index('asset_idx_scope_kind').on(t.tenantId, t.scopeId, t.kind),
    index('asset_idx_scope_current_version').on(t.tenantId, t.scopeId, t.currentVersionId),
  ],
)

export type IdbAssetDrizzleSqlite = InferSelectModel<typeof assetTableSqlite>
export type AssetColumnsDrizzleSqlite = keyof IdbAssetDrizzleSqlite

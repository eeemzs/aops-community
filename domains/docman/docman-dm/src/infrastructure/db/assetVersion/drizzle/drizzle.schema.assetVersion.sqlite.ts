import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const assetVersionTableSqlite = sqliteTable(
  domainTableName('asset_versions'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    assetId: text().notNull(),
    version: integer().notNull(),
    label: text(),
    status: text().notNull(),
    storageKey: text(),
    sourcePath: text(),
    sourceUrl: text(),
    filename: text(),
    mime: text().notNull(),
    contentHash: text().notNull(),
    byteSize: integer(),
    width: integer(),
    height: integer(),
    variants: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    meta: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('asset_version_unique').on(t.tenantId, t.assetId, t.version),
    index('asset_version_idx_asset').on(t.tenantId, t.assetId),
    index('asset_version_idx_status').on(t.tenantId, t.status),
    index('asset_version_idx_hash').on(t.tenantId, t.contentHash),
  ],
)

export type IdbAssetVersionDrizzleSqlite = InferSelectModel<typeof assetVersionTableSqlite>
export type AssetVersionColumnsDrizzleSqlite = keyof IdbAssetVersionDrizzleSqlite

import { InferSelectModel } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { domainTableName } from '../../domain-naming.js'

export const assetVersionTable = pgTable(
  domainTableName('asset_versions'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    assetId: uuid().notNull(),
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
    variants: jsonb().$type<Record<string, unknown>>(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('asset_version_unique').on(t.tenantId, t.assetId, t.version),
    index('asset_version_idx_asset').on(t.tenantId, t.assetId),
    index('asset_version_idx_status').on(t.tenantId, t.status),
    index('asset_version_idx_hash').on(t.tenantId, t.contentHash),
  ],
)

export type IdbAssetVersionDrizzle = InferSelectModel<typeof assetVersionTable>
export type AssetVersionColumnsDrizzle = keyof IdbAssetVersionDrizzle

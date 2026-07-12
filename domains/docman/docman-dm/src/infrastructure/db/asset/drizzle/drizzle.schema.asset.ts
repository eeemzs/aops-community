import { InferSelectModel } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { domainTableName } from '../../domain-naming.js'

export const assetTable = pgTable(
  domainTableName('assets'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    assetUid: text().notNull(),
    kind: text().notNull(),
    title: text(),
    slug: text(),
    altText: text(),
    currentVersionId: uuid(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('asset_uid_unique').on(t.tenantId, t.scopeId, t.assetUid),
    index('asset_idx_tenant').on(t.tenantId),
    index('asset_idx_scope').on(t.tenantId, t.scopeId),
    index('asset_idx_scope_kind').on(t.tenantId, t.scopeId, t.kind),
    index('asset_idx_scope_current_version').on(t.tenantId, t.scopeId, t.currentVersionId),
  ],
)

export type IdbAssetDrizzle = InferSelectModel<typeof assetTable>
export type AssetColumnsDrizzle = keyof IdbAssetDrizzle

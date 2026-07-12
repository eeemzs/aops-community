import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const documentGroupTable = pgTable(
  domainTableName('document-groups'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    groupUid: text().notNull(),
    parentGroupId: uuid(),
    parentGroupUid: text(),
    title: text().notNull(),
    description: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('document_group_uid_unique').on(t.tenantId, t.scopeId, t.groupUid),
    index('document_group_idx_tenant').on(t.tenantId),
    index('document_group_idx_scope').on(t.tenantId, t.scopeId),
    index('document_group_idx_parent').on(t.tenantId, t.parentGroupId),
  ]
)

export type IdbDocumentGroupDrizzle = InferSelectModel<typeof documentGroupTable>;
export type DocumentGroupColumnsDrizzle = keyof IdbDocumentGroupDrizzle;

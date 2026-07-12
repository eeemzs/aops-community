import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const artifactTable = pgTable(
  'artifacts',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    artifactType: text().notNull(),
    label: text(),
    storagePath: text().notNull(),
    mimeType: text(),
    sizeBytes: integer(),
    hash: text(),
    meta: jsonb(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('artifact_idx_tenant').on(t.tenantId),
    index('artifact_idx_scope_created').on(t.tenantId, t.scopeId, t.createdAt),
  ]
)

export type IdbArtifactDrizzle = InferSelectModel<typeof artifactTable>;
export type ArtifactColumnsDrizzle = keyof IdbArtifactDrizzle;

import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { artifactTable } from '../../artifact/drizzle/drizzle.schema.artifact.js'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'

export const artifactLinkTable = pgTable(
  'artifact-links',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    artifactId: uuid()
      .notNull()
      .references(() => artifactTable.id, { onDelete: 'cascade' }),
    refType: text().notNull(),
    refId: text().notNull(),
    createdBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('artifact_link_idx_tenant').on(t.tenantId),
    index('artifact_link_idx_artifact').on(t.tenantId, t.artifactId),
    index('artifact_link_idx_project_ref_created').on(t.tenantId, t.projectId, t.refType, t.refId, t.createdAt),
  ]
)

export type IdbArtifactLinkDrizzle = InferSelectModel<typeof artifactLinkTable>;
export type ArtifactLinkColumnsDrizzle = keyof IdbArtifactLinkDrizzle;

import { InferSelectModel } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'
import { skillTable } from '../../skill/drizzle/drizzle.schema.skill.js'

export const skillVersionTable = pgTable(
  'skill-versions',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    skillId: uuid()
      .notNull()
      .references(() => skillTable.id, { onDelete: 'cascade' }),
    version: integer().notNull(),
    status: text().notNull(),
    content: text().notNull(),
    entryFile: text(),
    skillStandard: text().notNull().default('aops-skill-v1'),
    files: jsonb().$type<Array<Record<string, unknown>>>(),
    meta: jsonb(),
    refType: text(),
    refId: text(),
    createdBy: text(),
    updatedBy: text(),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('skill_version_unique').on(t.tenantId, t.skillId, t.version),
    index('skill_version_idx_tenant').on(t.tenantId),
    index('skill_version_idx_project').on(t.tenantId, t.projectId),
    index('skill_version_idx_skill').on(t.tenantId, t.skillId),
  ]
)

export type IdbSkillVersionDrizzle = InferSelectModel<typeof skillVersionTable>
export type SkillVersionColumnsDrizzle = keyof IdbSkillVersionDrizzle

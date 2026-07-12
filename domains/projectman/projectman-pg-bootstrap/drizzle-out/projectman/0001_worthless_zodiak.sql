ALTER TABLE "projectman_kanban_column_groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "projectman_kanban_column_groups" CASCADE;--> statement-breakpoint
ALTER TABLE "projectman_kanban_columns" RENAME COLUMN "statusKey" TO "slug";--> statement-breakpoint
DROP INDEX "kanban_column_idx_status";--> statement-breakpoint
DROP INDEX "kanban_task_idx_column_group";--> statement-breakpoint
DROP INDEX "kanban_task_position_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_column_scope_slug_unique" ON "projectman_kanban_columns" USING btree ("tenantId","scopeId","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_task_position_unique" ON "projectman_kanban_tasks" USING btree ("tenantId","boardColumnId","position");--> statement-breakpoint
ALTER TABLE "projectman_kanban_tasks" DROP COLUMN "columnGroupId";
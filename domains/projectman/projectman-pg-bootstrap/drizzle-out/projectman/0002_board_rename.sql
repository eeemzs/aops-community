DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'projectman_kanban_board_groups'
  ) AND NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'projectman_kanban_boards'
  ) THEN
    ALTER TABLE "projectman_kanban_board_groups" RENAME TO "projectman_kanban_boards";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'projectman_kanban_board_columns'
       AND column_name = 'boardGroupId'
  ) THEN
    ALTER TABLE "projectman_kanban_board_columns" RENAME COLUMN "boardGroupId" TO "boardId";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'projectman_kanban_tasks'
       AND column_name = 'boardGroupId'
  ) THEN
    ALTER TABLE "projectman_kanban_tasks" RENAME COLUMN "boardGroupId" TO "boardId";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_scope_name_unique')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_scope_name_unique') THEN
    ALTER INDEX "kanban_board_group_scope_name_unique" RENAME TO "kanban_board_scope_name_unique";
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_scope_name_unique')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_scope_name_unique') THEN
    DROP INDEX "kanban_board_group_scope_name_unique";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_scope_slug_unique')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_scope_slug_unique') THEN
    ALTER INDEX "kanban_board_group_scope_slug_unique" RENAME TO "kanban_board_scope_slug_unique";
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_scope_slug_unique')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_scope_slug_unique') THEN
    DROP INDEX "kanban_board_group_scope_slug_unique";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_position_unique')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_position_unique') THEN
    ALTER INDEX "kanban_board_group_position_unique" RENAME TO "kanban_board_position_unique";
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_position_unique')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_position_unique') THEN
    DROP INDEX "kanban_board_group_position_unique";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_idx_tenant')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_idx_tenant') THEN
    ALTER INDEX "kanban_board_group_idx_tenant" RENAME TO "kanban_board_idx_tenant";
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_idx_tenant')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_idx_tenant') THEN
    DROP INDEX "kanban_board_group_idx_tenant";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_idx_scope')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_idx_scope') THEN
    ALTER INDEX "kanban_board_group_idx_scope" RENAME TO "kanban_board_idx_scope";
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_group_idx_scope')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_board_idx_scope') THEN
    DROP INDEX "kanban_board_group_idx_scope";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_task_idx_board_group')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_task_idx_board') THEN
    ALTER INDEX "kanban_task_idx_board_group" RENAME TO "kanban_task_idx_board";
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_task_idx_board_group')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kanban_task_idx_board') THEN
    DROP INDEX "kanban_task_idx_board_group";
  END IF;
END $$;

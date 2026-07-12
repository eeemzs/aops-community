CREATE TABLE "projectman_kanban_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"position" integer NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_kanban_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"name" text NOT NULL,
	"statusKey" text,
	"description" text,
	"wipLimit" integer,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_kanban_column_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"columnId" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"wipLimit" integer,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_kanban_board_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"boardId" uuid NOT NULL,
	"columnId" uuid NOT NULL,
	"position" integer NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_kanban_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"boardId" uuid NOT NULL,
	"boardColumnId" uuid NOT NULL,
	"columnGroupId" uuid,
	"sprintId" uuid,
	"title" text NOT NULL,
	"taskCode" text,
	"slug" text,
	"description" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"position" integer NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_kanban_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb,
	"actorId" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"kanbanTaskId" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"references" jsonb,
	"scope" jsonb,
	"validationPlan" jsonb,
	"notes" text,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_sprint_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"sprintId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_sprint_microtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"phaseId" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"position" integer NOT NULL,
	"notes" text,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_issue_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"sprintId" uuid,
	"kanbanTaskId" uuid,
	"microTaskItemId" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"severity" text NOT NULL,
	"source" text NOT NULL,
	"tags" jsonb,
	"notes" text,
	"meta" jsonb,
	"openedAt" timestamp with time zone,
	"resolvedAt" timestamp with time zone,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectman_feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"sprintId" uuid,
	"kanbanTaskId" uuid,
	"microTaskItemId" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"source" text NOT NULL,
	"tags" jsonb,
	"suggestion" text,
	"notes" text,
	"meta" jsonb,
	"recordedAt" timestamp with time zone,
	"handledAt" timestamp with time zone,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_board_scope_name_unique" ON "projectman_kanban_boards" USING btree ("tenantId","scopeId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_board_scope_slug_unique" ON "projectman_kanban_boards" USING btree ("tenantId","scopeId","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_board_position_unique" ON "projectman_kanban_boards" USING btree ("tenantId","scopeId","position");--> statement-breakpoint
CREATE INDEX "kanban_board_idx_tenant" ON "projectman_kanban_boards" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "kanban_board_idx_scope" ON "projectman_kanban_boards" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "kanban_column_idx_tenant" ON "projectman_kanban_columns" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "kanban_column_idx_scope" ON "projectman_kanban_columns" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "kanban_column_idx_status" ON "projectman_kanban_columns" USING btree ("tenantId","statusKey");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_column_group_position_unique" ON "projectman_kanban_column_groups" USING btree ("tenantId","columnId","position");--> statement-breakpoint
CREATE INDEX "kanban_column_group_idx_tenant" ON "projectman_kanban_column_groups" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "kanban_column_group_idx_scope" ON "projectman_kanban_column_groups" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "kanban_column_group_idx_column" ON "projectman_kanban_column_groups" USING btree ("tenantId","columnId");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_board_column_unique" ON "projectman_kanban_board_columns" USING btree ("tenantId","boardId","columnId");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_board_column_position_unique" ON "projectman_kanban_board_columns" USING btree ("tenantId","boardId","position");--> statement-breakpoint
CREATE INDEX "kanban_board_column_idx_tenant" ON "projectman_kanban_board_columns" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "kanban_board_column_idx_scope" ON "projectman_kanban_board_columns" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "kanban_board_column_idx_board" ON "projectman_kanban_board_columns" USING btree ("tenantId","boardId");--> statement-breakpoint
CREATE INDEX "kanban_board_column_idx_column" ON "projectman_kanban_board_columns" USING btree ("tenantId","columnId");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_task_position_unique" ON "projectman_kanban_tasks" USING btree ("tenantId","boardColumnId","columnGroupId","position");--> statement-breakpoint
CREATE INDEX "kanban_task_idx_tenant" ON "projectman_kanban_tasks" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "kanban_task_idx_scope" ON "projectman_kanban_tasks" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "kanban_task_idx_board" ON "projectman_kanban_tasks" USING btree ("tenantId","boardId");--> statement-breakpoint
CREATE INDEX "kanban_task_idx_board_column" ON "projectman_kanban_tasks" USING btree ("tenantId","boardColumnId");--> statement-breakpoint
CREATE INDEX "kanban_task_idx_column_group" ON "projectman_kanban_tasks" USING btree ("tenantId","columnGroupId");--> statement-breakpoint
CREATE INDEX "kanban_task_idx_sprint" ON "projectman_kanban_tasks" USING btree ("tenantId","sprintId");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_task_scope_code_unique" ON "projectman_kanban_tasks" USING btree ("tenantId","scopeId","taskCode");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_task_scope_slug_unique" ON "projectman_kanban_tasks" USING btree ("tenantId","scopeId","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projectman_kanban_template_name_unique" ON "projectman_kanban_templates" USING btree ("tenantId","scopeId","name");--> statement-breakpoint
CREATE INDEX "projectman_kanban_template_idx_tenant" ON "projectman_kanban_templates" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "projectman_kanban_template_idx_scope" ON "projectman_kanban_templates" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "projectman_event_idx_tenant" ON "projectman_events" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "projectman_event_idx_scope" ON "projectman_events" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "projectman_event_idx_entity" ON "projectman_events" USING btree ("tenantId","entityType","entityId");--> statement-breakpoint
CREATE INDEX "projectman_event_idx_action" ON "projectman_events" USING btree ("tenantId","action");--> statement-breakpoint
CREATE INDEX "projectman_event_idx_created_at" ON "projectman_events" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "projectman_sprint_idx_tenant" ON "projectman_sprints" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "projectman_sprint_idx_scope" ON "projectman_sprints" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "projectman_sprint_idx_kanban_task" ON "projectman_sprints" USING btree ("tenantId","kanbanTaskId");--> statement-breakpoint
CREATE UNIQUE INDEX "projectman_sprint_task_unique" ON "projectman_sprints" USING btree ("tenantId","kanbanTaskId");--> statement-breakpoint
CREATE UNIQUE INDEX "projectman_sprint_phase_position_unique" ON "projectman_sprint_phases" USING btree ("tenantId","sprintId","position");--> statement-breakpoint
CREATE INDEX "projectman_sprint_phase_idx_tenant" ON "projectman_sprint_phases" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "projectman_sprint_phase_idx_sprint" ON "projectman_sprint_phases" USING btree ("tenantId","sprintId");--> statement-breakpoint
CREATE UNIQUE INDEX "projectman_sprint_microtask_position_unique" ON "projectman_sprint_microtasks" USING btree ("tenantId","phaseId","position");--> statement-breakpoint
CREATE INDEX "projectman_sprint_microtask_idx_tenant" ON "projectman_sprint_microtasks" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "projectman_sprint_microtask_idx_phase" ON "projectman_sprint_microtasks" USING btree ("tenantId","phaseId");--> statement-breakpoint
CREATE INDEX "issue_item_idx_tenant" ON "projectman_issue_items" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "issue_item_idx_scope" ON "projectman_issue_items" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "issue_item_idx_status" ON "projectman_issue_items" USING btree ("tenantId","scopeId","status");--> statement-breakpoint
CREATE INDEX "issue_item_idx_severity" ON "projectman_issue_items" USING btree ("tenantId","scopeId","severity");--> statement-breakpoint
CREATE INDEX "issue_item_idx_source" ON "projectman_issue_items" USING btree ("tenantId","scopeId","source");--> statement-breakpoint
CREATE INDEX "issue_item_idx_sprint" ON "projectman_issue_items" USING btree ("tenantId","sprintId");--> statement-breakpoint
CREATE INDEX "issue_item_idx_kanban_task" ON "projectman_issue_items" USING btree ("tenantId","kanbanTaskId");--> statement-breakpoint
CREATE INDEX "issue_item_idx_micro_task" ON "projectman_issue_items" USING btree ("tenantId","microTaskItemId");--> statement-breakpoint
CREATE INDEX "issue_item_idx_created_at" ON "projectman_issue_items" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_tenant" ON "projectman_feedback_items" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_scope" ON "projectman_feedback_items" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_status" ON "projectman_feedback_items" USING btree ("tenantId","scopeId","status");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_type" ON "projectman_feedback_items" USING btree ("tenantId","scopeId","type");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_severity" ON "projectman_feedback_items" USING btree ("tenantId","scopeId","severity");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_source" ON "projectman_feedback_items" USING btree ("tenantId","scopeId","source");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_sprint" ON "projectman_feedback_items" USING btree ("tenantId","sprintId");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_kanban_task" ON "projectman_feedback_items" USING btree ("tenantId","kanbanTaskId");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_micro_task" ON "projectman_feedback_items" USING btree ("tenantId","microTaskItemId");--> statement-breakpoint
CREATE INDEX "feedback_item_idx_created_at" ON "projectman_feedback_items" USING btree ("tenantId","createdAt");

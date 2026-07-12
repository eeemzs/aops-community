PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "projectman_kanban_boards" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT,
  "description" TEXT,
  "position" INTEGER NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_board_scope_name_unique" ON "projectman_kanban_boards" ("tenantId", "scopeId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_board_scope_slug_unique" ON "projectman_kanban_boards" ("tenantId", "scopeId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_board_position_unique" ON "projectman_kanban_boards" ("tenantId", "scopeId", "position");
CREATE INDEX IF NOT EXISTS "kanban_board_idx_tenant" ON "projectman_kanban_boards" ("tenantId");
CREATE INDEX IF NOT EXISTS "kanban_board_idx_scope" ON "projectman_kanban_boards" ("tenantId", "scopeId");

CREATE TABLE IF NOT EXISTS "projectman_kanban_columns" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "wipLimit" INTEGER,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS "kanban_column_idx_tenant" ON "projectman_kanban_columns" ("tenantId");
CREATE INDEX IF NOT EXISTS "kanban_column_idx_scope" ON "projectman_kanban_columns" ("tenantId", "scopeId");
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_column_scope_slug_unique" ON "projectman_kanban_columns" ("tenantId", "scopeId", "slug");

CREATE TABLE IF NOT EXISTS "projectman_kanban_board_columns" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "columnId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_board_column_unique" ON "projectman_kanban_board_columns" ("tenantId", "boardId", "columnId");
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_board_column_position_unique" ON "projectman_kanban_board_columns" ("tenantId", "boardId", "position");
CREATE INDEX IF NOT EXISTS "kanban_board_column_idx_tenant" ON "projectman_kanban_board_columns" ("tenantId");
CREATE INDEX IF NOT EXISTS "kanban_board_column_idx_scope" ON "projectman_kanban_board_columns" ("tenantId", "scopeId");
CREATE INDEX IF NOT EXISTS "kanban_board_column_idx_board" ON "projectman_kanban_board_columns" ("tenantId", "boardId");
CREATE INDEX IF NOT EXISTS "kanban_board_column_idx_column" ON "projectman_kanban_board_columns" ("tenantId", "columnId");

CREATE TABLE IF NOT EXISTS "projectman_kanban_tasks" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "boardColumnId" TEXT NOT NULL,
  "sprintId" TEXT,
  "title" TEXT NOT NULL,
  "taskCode" TEXT,
  "slug" TEXT,
  "description" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "position" INTEGER NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_task_position_unique" ON "projectman_kanban_tasks" ("tenantId", "boardColumnId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_task_scope_code_unique" ON "projectman_kanban_tasks" ("tenantId", "scopeId", "taskCode");
CREATE UNIQUE INDEX IF NOT EXISTS "kanban_task_scope_slug_unique" ON "projectman_kanban_tasks" ("tenantId", "scopeId", "slug");
CREATE INDEX IF NOT EXISTS "kanban_task_idx_tenant" ON "projectman_kanban_tasks" ("tenantId");
CREATE INDEX IF NOT EXISTS "kanban_task_idx_scope" ON "projectman_kanban_tasks" ("tenantId", "scopeId");
CREATE INDEX IF NOT EXISTS "kanban_task_idx_board" ON "projectman_kanban_tasks" ("tenantId", "boardId");
CREATE INDEX IF NOT EXISTS "kanban_task_idx_board_column" ON "projectman_kanban_tasks" ("tenantId", "boardColumnId");
CREATE INDEX IF NOT EXISTS "kanban_task_idx_sprint" ON "projectman_kanban_tasks" ("tenantId", "sprintId");

CREATE TABLE IF NOT EXISTS "projectman_sprints" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "kanbanTaskId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "references" TEXT,
  "scope" TEXT,
  "validationPlan" TEXT,
  "notes" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS "projectman_sprint_idx_tenant" ON "projectman_sprints" ("tenantId");
CREATE INDEX IF NOT EXISTS "projectman_sprint_idx_scope" ON "projectman_sprints" ("tenantId", "scopeId");
CREATE INDEX IF NOT EXISTS "projectman_sprint_idx_kanban_task" ON "projectman_sprints" ("tenantId", "kanbanTaskId");

CREATE TABLE IF NOT EXISTS "projectman_sprint_phases" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "position" INTEGER NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE UNIQUE INDEX IF NOT EXISTS "projectman_sprint_phase_position_unique" ON "projectman_sprint_phases" ("tenantId", "sprintId", "position");
CREATE INDEX IF NOT EXISTS "projectman_sprint_phase_idx_tenant" ON "projectman_sprint_phases" ("tenantId");
CREATE INDEX IF NOT EXISTS "projectman_sprint_phase_idx_sprint" ON "projectman_sprint_phases" ("tenantId", "sprintId");

CREATE TABLE IF NOT EXISTS "projectman_sprint_microtasks" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "phaseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "notes" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE UNIQUE INDEX IF NOT EXISTS "projectman_sprint_microtask_position_unique" ON "projectman_sprint_microtasks" ("tenantId", "phaseId", "position");
CREATE INDEX IF NOT EXISTS "projectman_sprint_microtask_idx_tenant" ON "projectman_sprint_microtasks" ("tenantId");
CREATE INDEX IF NOT EXISTS "projectman_sprint_microtask_idx_phase" ON "projectman_sprint_microtasks" ("tenantId", "phaseId");

CREATE TABLE IF NOT EXISTS "projectman_issue_items" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "sprintId" TEXT,
  "kanbanTaskId" TEXT,
  "microTaskItemId" TEXT,
  "reviewRequestId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "tags" TEXT,
  "notes" TEXT,
  "meta" TEXT,
  "openedAt" INTEGER,
  "resolvedAt" INTEGER,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS "issue_item_idx_tenant" ON "projectman_issue_items" ("tenantId");
CREATE INDEX IF NOT EXISTS "issue_item_idx_scope" ON "projectman_issue_items" ("tenantId", "scopeId");
CREATE INDEX IF NOT EXISTS "issue_item_idx_status" ON "projectman_issue_items" ("tenantId", "scopeId", "status");
CREATE INDEX IF NOT EXISTS "issue_item_idx_severity" ON "projectman_issue_items" ("tenantId", "scopeId", "severity");
CREATE INDEX IF NOT EXISTS "issue_item_idx_source" ON "projectman_issue_items" ("tenantId", "scopeId", "source");
CREATE INDEX IF NOT EXISTS "issue_item_idx_sprint" ON "projectman_issue_items" ("tenantId", "sprintId");
CREATE INDEX IF NOT EXISTS "issue_item_idx_kanban_task" ON "projectman_issue_items" ("tenantId", "kanbanTaskId");
CREATE INDEX IF NOT EXISTS "issue_item_idx_micro_task" ON "projectman_issue_items" ("tenantId", "microTaskItemId");
CREATE INDEX IF NOT EXISTS "issue_item_idx_review_request" ON "projectman_issue_items" ("tenantId", "reviewRequestId");
CREATE INDEX IF NOT EXISTS "issue_item_idx_created_at" ON "projectman_issue_items" ("tenantId", "createdAt");

CREATE TABLE IF NOT EXISTS "projectman_review_requests" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "sprintId" TEXT,
  "kanbanTaskId" TEXT,
  "microTaskItemId" TEXT,
  "collabSessionId" TEXT,
  "collabRequestEventId" TEXT,
  "collabResultEventIds" TEXT,
  "parentReviewRequestId" TEXT,
  "rootReviewRequestId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "reviewScope" TEXT,
  "instructions" TEXT,
  "references" TEXT,
  "status" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "tags" TEXT,
  "requestedBy" TEXT,
  "targetAgent" TEXT,
  "targetSlot" TEXT,
  "results" TEXT,
  "idempotencyKey" TEXT,
  "notes" TEXT,
  "meta" TEXT,
  "requestedAt" INTEGER,
  "closedAt" INTEGER,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS "review_request_idx_tenant" ON "projectman_review_requests" ("tenantId");
CREATE INDEX IF NOT EXISTS "review_request_idx_scope" ON "projectman_review_requests" ("tenantId", "scopeId");
CREATE INDEX IF NOT EXISTS "review_request_idx_status" ON "projectman_review_requests" ("tenantId", "scopeId", "status");
CREATE INDEX IF NOT EXISTS "review_request_idx_priority" ON "projectman_review_requests" ("tenantId", "scopeId", "priority");
CREATE INDEX IF NOT EXISTS "review_request_idx_source" ON "projectman_review_requests" ("tenantId", "scopeId", "source");
CREATE INDEX IF NOT EXISTS "review_request_idx_sprint" ON "projectman_review_requests" ("tenantId", "sprintId");
CREATE INDEX IF NOT EXISTS "review_request_idx_kanban_task" ON "projectman_review_requests" ("tenantId", "kanbanTaskId");
CREATE INDEX IF NOT EXISTS "review_request_idx_micro_task" ON "projectman_review_requests" ("tenantId", "microTaskItemId");
CREATE INDEX IF NOT EXISTS "review_request_idx_target_agent" ON "projectman_review_requests" ("tenantId", "targetAgent");
CREATE INDEX IF NOT EXISTS "review_request_idx_parent" ON "projectman_review_requests" ("tenantId", "parentReviewRequestId");
CREATE INDEX IF NOT EXISTS "review_request_idx_root" ON "projectman_review_requests" ("tenantId", "rootReviewRequestId");
CREATE INDEX IF NOT EXISTS "review_request_idx_idempotency" ON "projectman_review_requests" ("tenantId", "scopeId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "review_request_idx_created_at" ON "projectman_review_requests" ("tenantId", "createdAt");

CREATE TABLE IF NOT EXISTS "projectman_feedback_items" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "sprintId" TEXT,
  "kanbanTaskId" TEXT,
  "microTaskItemId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "tags" TEXT,
  "suggestion" TEXT,
  "notes" TEXT,
  "meta" TEXT,
  "recordedAt" INTEGER,
  "handledAt" INTEGER,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS "feedback_item_idx_tenant" ON "projectman_feedback_items" ("tenantId");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_scope" ON "projectman_feedback_items" ("tenantId", "scopeId");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_status" ON "projectman_feedback_items" ("tenantId", "scopeId", "status");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_type" ON "projectman_feedback_items" ("tenantId", "scopeId", "type");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_severity" ON "projectman_feedback_items" ("tenantId", "scopeId", "severity");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_source" ON "projectman_feedback_items" ("tenantId", "scopeId", "source");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_sprint" ON "projectman_feedback_items" ("tenantId", "sprintId");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_kanban_task" ON "projectman_feedback_items" ("tenantId", "kanbanTaskId");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_micro_task" ON "projectman_feedback_items" ("tenantId", "microTaskItemId");
CREATE INDEX IF NOT EXISTS "feedback_item_idx_created_at" ON "projectman_feedback_items" ("tenantId", "createdAt");

CREATE TABLE IF NOT EXISTS "projectman_kanban_templates" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "definition" TEXT NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE UNIQUE INDEX IF NOT EXISTS "projectman_kanban_template_name_unique" ON "projectman_kanban_templates" ("tenantId", "scopeId", "name");
CREATE INDEX IF NOT EXISTS "projectman_kanban_template_idx_tenant" ON "projectman_kanban_templates" ("tenantId");
CREATE INDEX IF NOT EXISTS "projectman_kanban_template_idx_scope" ON "projectman_kanban_templates" ("tenantId", "scopeId");

CREATE TABLE IF NOT EXISTS "projectman_events" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (abs(random()) % 4) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  "tenantId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" TEXT,
  "actorId" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);
CREATE INDEX IF NOT EXISTS "projectman_event_idx_tenant" ON "projectman_events" ("tenantId");
CREATE INDEX IF NOT EXISTS "projectman_event_idx_scope" ON "projectman_events" ("tenantId", "scopeId");
CREATE INDEX IF NOT EXISTS "projectman_event_idx_entity" ON "projectman_events" ("tenantId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "projectman_event_idx_action" ON "projectman_events" ("tenantId", "action");
CREATE INDEX IF NOT EXISTS "projectman_event_idx_created_at" ON "projectman_events" ("tenantId", "createdAt");

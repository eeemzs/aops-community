ALTER TABLE "projectman_issue_items" ADD COLUMN IF NOT EXISTS "reviewRequestId" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_item_idx_review_request" ON "projectman_issue_items" USING btree ("tenantId","reviewRequestId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projectman_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"sprintId" uuid,
	"kanbanTaskId" uuid,
	"microTaskItemId" uuid,
	"collabSessionId" text,
	"collabRequestEventId" text,
	"collabResultEventIds" jsonb,
	"parentReviewRequestId" uuid,
	"rootReviewRequestId" uuid,
	"title" text NOT NULL,
	"description" text,
	"reviewScope" text,
	"instructions" text,
	"references" jsonb,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"source" text NOT NULL,
	"tags" jsonb,
	"requestedBy" text,
	"targetAgent" text,
	"targetSlot" text,
	"results" jsonb,
	"notes" text,
	"meta" jsonb,
	"requestedAt" timestamp with time zone,
	"closedAt" timestamp with time zone,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_tenant" ON "projectman_review_requests" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_scope" ON "projectman_review_requests" USING btree ("tenantId","scopeId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_status" ON "projectman_review_requests" USING btree ("tenantId","scopeId","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_priority" ON "projectman_review_requests" USING btree ("tenantId","scopeId","priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_source" ON "projectman_review_requests" USING btree ("tenantId","scopeId","source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_sprint" ON "projectman_review_requests" USING btree ("tenantId","sprintId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_kanban_task" ON "projectman_review_requests" USING btree ("tenantId","kanbanTaskId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_micro_task" ON "projectman_review_requests" USING btree ("tenantId","microTaskItemId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_target_agent" ON "projectman_review_requests" USING btree ("tenantId","targetAgent");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_parent" ON "projectman_review_requests" USING btree ("tenantId","parentReviewRequestId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_root" ON "projectman_review_requests" USING btree ("tenantId","rootReviewRequestId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_created_at" ON "projectman_review_requests" USING btree ("tenantId","createdAt");

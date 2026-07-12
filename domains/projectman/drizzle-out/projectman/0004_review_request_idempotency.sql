ALTER TABLE "projectman_review_requests" ADD COLUMN IF NOT EXISTS "idempotencyKey" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_idx_idempotency" ON "projectman_review_requests" USING btree ("tenantId","scopeId","idempotencyKey");

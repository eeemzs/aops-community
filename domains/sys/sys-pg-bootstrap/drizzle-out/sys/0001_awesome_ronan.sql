DROP INDEX IF EXISTS " rate_limiter_tenant_key_type_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limiter_tenant_key_type_idx" ON "sys_rate_limiters" USING btree ("tenantId","key","scope");

ALTER TABLE "sys_rate_limiters" ADD COLUMN IF NOT EXISTS "violationStreak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sys_rate_limiters" ADD COLUMN IF NOT EXISTS "lastViolationAt" timestamp with time zone;

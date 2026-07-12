CREATE TABLE IF NOT EXISTS "sys_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"tenantId" uuid NOT NULL,
	"scopeId" text DEFAULT 'default' NOT NULL,
	"counterKey" text NOT NULL,
	"prefix" text,
	"width" integer DEFAULT 5 NOT NULL,
	"nextValue" integer DEFAULT 1 NOT NULL,
	"step" integer DEFAULT 1 NOT NULL,
	"lastValue" integer,
	"lastFormattedValue" text,
	"metadataJson" jsonb
);
--> statement-breakpoint
ALTER TABLE "sys_counters" ADD COLUMN IF NOT EXISTS "metadataJson" jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sys_counter_tenant_scope_key_uidx" ON "sys_counters" USING btree ("tenantId","scopeId","counterKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sys_counter_tenant_scope_idx" ON "sys_counters" USING btree ("tenantId","scopeId");

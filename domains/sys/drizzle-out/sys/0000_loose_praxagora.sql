CREATE TABLE "sys_rate_limiters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"tenantId" uuid NOT NULL,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"windowStart" timestamp with time zone,
	"resetAt" timestamp with time zone,
	"blockedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sys_event_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"tenantId" uuid NOT NULL,
	"eventType" text NOT NULL,
	"aggregateId" text NOT NULL,
	"eventData" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX " rate_limiter_tenant_key_type_idx" ON "sys_rate_limiters" USING btree ("tenantId","key","scope");--> statement-breakpoint
CREATE INDEX "idxTenantEventType" ON "sys_event_stores" USING btree ("tenantId","eventType");--> statement-breakpoint
CREATE INDEX "idxTenantAggregate" ON "sys_event_stores" USING btree ("tenantId","aggregateId");--> statement-breakpoint
CREATE INDEX "idxTenantOccurredAt" ON "sys_event_stores" USING btree ("tenantId","occurredAt");--> statement-breakpoint
CREATE INDEX "idxEventTypeOccurredAt" ON "sys_event_stores" USING btree ("eventType","occurredAt");--> statement-breakpoint
CREATE INDEX "idxAggregateVersion" ON "sys_event_stores" USING btree ("aggregateId","version");
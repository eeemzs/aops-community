ALTER TABLE "sys_event_stores" ADD COLUMN IF NOT EXISTS "eventId" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idxEventIdUnique" ON "sys_event_stores" USING btree ("eventId");

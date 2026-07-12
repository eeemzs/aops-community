CREATE TABLE "docman_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"assetUid" text NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"slug" text,
	"altText" text,
	"currentVersionId" uuid,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_asset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"assetId" uuid NOT NULL,
	"version" integer NOT NULL,
	"label" text,
	"status" text NOT NULL,
	"storageKey" text,
	"sourcePath" text,
	"sourceUrl" text,
	"filename" text,
	"mime" text NOT NULL,
	"contentHash" text NOT NULL,
	"byteSize" integer,
	"width" integer,
	"height" integer,
	"variants" jsonb,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "asset_uid_unique" ON "docman_assets" USING btree ("tenantId","scopeId","assetUid");--> statement-breakpoint
CREATE INDEX "asset_idx_tenant" ON "docman_assets" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "asset_idx_scope" ON "docman_assets" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "asset_idx_scope_kind" ON "docman_assets" USING btree ("tenantId","scopeId","kind");--> statement-breakpoint
CREATE INDEX "asset_idx_scope_current_version" ON "docman_assets" USING btree ("tenantId","scopeId","currentVersionId");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_version_unique" ON "docman_asset_versions" USING btree ("tenantId","assetId","version");--> statement-breakpoint
CREATE INDEX "asset_version_idx_asset" ON "docman_asset_versions" USING btree ("tenantId","assetId");--> statement-breakpoint
CREATE INDEX "asset_version_idx_status" ON "docman_asset_versions" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "asset_version_idx_hash" ON "docman_asset_versions" USING btree ("tenantId","contentHash");

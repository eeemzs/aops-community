CREATE TABLE "docman_document_index_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"documentVersionId" uuid NOT NULL,
	"documentId" uuid NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"fallbackLocale" text DEFAULT '' NOT NULL,
	"itemKind" text NOT NULL,
	"sortOrder" integer NOT NULL,
	"buildFingerprint" text NOT NULL,
	"linkId" uuid,
	"parentLinkId" uuid,
	"anchor" text NOT NULL,
	"parentAnchor" text,
	"number" text,
	"depth" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"breadcrumb" text NOT NULL,
	"titleVisible" boolean DEFAULT true NOT NULL,
	"pageBreakBefore" boolean DEFAULT false NOT NULL,
	"pageBreakAfter" boolean DEFAULT false NOT NULL,
	"sectionId" uuid,
	"sectionUid" text,
	"sectionSlug" text,
	"pageId" uuid,
	"pageUid" text,
	"pageVersionId" uuid,
	"format" text,
	"pageNumberStart" integer,
	"pageNumberEnd" integer,
	"bodyText" text,
	"searchText" text NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "doc_index_entry_sort_unique" ON "docman_document_index_entries" USING btree ("tenantId","documentVersionId","locale","fallbackLocale","sortOrder");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_index_entry_anchor_unique" ON "docman_document_index_entries" USING btree ("tenantId","documentVersionId","locale","fallbackLocale","anchor");--> statement-breakpoint
CREATE INDEX "doc_index_entry_idx_doc_version" ON "docman_document_index_entries" USING btree ("tenantId","documentVersionId","locale","fallbackLocale");--> statement-breakpoint
CREATE INDEX "doc_index_entry_idx_link" ON "docman_document_index_entries" USING btree ("tenantId","linkId");--> statement-breakpoint
CREATE INDEX "doc_index_entry_idx_page_version" ON "docman_document_index_entries" USING btree ("tenantId","pageVersionId");--> statement-breakpoint
CREATE INDEX "doc_index_entry_idx_section" ON "docman_document_index_entries" USING btree ("tenantId","sectionId");

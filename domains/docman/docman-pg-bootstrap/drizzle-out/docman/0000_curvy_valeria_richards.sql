CREATE TABLE "docman_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"documentUid" text NOT NULL,
	"groupId" uuid,
	"groupUid" text,
	"slug" text,
	"title" text NOT NULL,
	"titleMl" jsonb,
	"summary" text,
	"summaryMl" jsonb,
	"description" text,
	"descriptionMl" jsonb,
	"status" text NOT NULL,
	"visibility" text NOT NULL,
	"tags" jsonb,
	"pageSize" text,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_document_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"groupUid" text NOT NULL,
	"parentGroupId" uuid,
	"parentGroupUid" text,
	"title" text NOT NULL,
	"description" text,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"documentId" uuid NOT NULL,
	"version" integer NOT NULL,
	"label" text,
	"status" text NOT NULL,
	"title" text,
	"summary" text,
	"releaseNotes" text,
	"releaseNotesMl" jsonb,
	"isCurrent" boolean DEFAULT false NOT NULL,
	"basedOnVersionId" uuid,
	"publishedAt" timestamp with time zone,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"sectionUid" text NOT NULL,
	"title" text NOT NULL,
	"titleMl" jsonb,
	"description" text,
	"descriptionMl" jsonb,
	"kind" text,
	"slug" text,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"pageUid" text NOT NULL,
	"title" text NOT NULL,
	"titleMl" jsonb,
	"kind" text,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"pageId" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text,
	"format" text NOT NULL,
	"content" text,
	"contentMl" jsonb,
	"contentData" jsonb,
	"directives" jsonb,
	"status" text NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_document_section_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"documentVersionId" uuid NOT NULL,
	"kind" text NOT NULL,
	"sectionId" uuid,
	"pageVersionId" uuid,
	"parentLinkId" uuid,
	"position" integer NOT NULL,
	"depth" integer,
	"titleOverride" text,
	"titleVisible" boolean DEFAULT true NOT NULL,
	"numbering" text,
	"pageBreakBefore" boolean DEFAULT false NOT NULL,
	"pageBreakAfter" boolean DEFAULT false NOT NULL,
	"directives" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_section_page_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"sectionId" uuid NOT NULL,
	"pageVersionId" uuid NOT NULL,
	"position" integer NOT NULL,
	"numbering" text,
	"titleOverride" text,
	"titleVisible" boolean DEFAULT true NOT NULL,
	"pageBreakBefore" boolean DEFAULT false NOT NULL,
	"pageBreakAfter" boolean DEFAULT false NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_snippets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"snippetUid" text NOT NULL,
	"title" text,
	"language" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_page_snippet_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"pageVersionId" uuid NOT NULL,
	"snippetId" uuid NOT NULL,
	"position" integer NOT NULL,
	"caption" text,
	"showLineNumbers" boolean,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_embeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"embedUid" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"content" text,
	"url" text,
	"path" text,
	"mime" text,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "docman_page_embed_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"pageVersionId" uuid NOT NULL,
	"embedId" uuid NOT NULL,
	"position" integer NOT NULL,
	"caption" text,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "document_uid_unique" ON "docman_documents" USING btree ("tenantId","scopeId","documentUid");--> statement-breakpoint
CREATE INDEX "document_idx_tenant" ON "docman_documents" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "document_idx_scope" ON "docman_documents" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "document_idx_status" ON "docman_documents" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "document_idx_scope_slug" ON "docman_documents" USING btree ("tenantId","scopeId","slug");--> statement-breakpoint
CREATE INDEX "document_idx_scope_group_id" ON "docman_documents" USING btree ("tenantId","scopeId","groupId");--> statement-breakpoint
CREATE INDEX "document_idx_scope_group_uid" ON "docman_documents" USING btree ("tenantId","scopeId","groupUid");--> statement-breakpoint
CREATE UNIQUE INDEX "document_group_uid_unique" ON "docman_document_groups" USING btree ("tenantId","scopeId","groupUid");--> statement-breakpoint
CREATE INDEX "document_group_idx_tenant" ON "docman_document_groups" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "document_group_idx_scope" ON "docman_document_groups" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "document_group_idx_parent" ON "docman_document_groups" USING btree ("tenantId","parentGroupId");--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_unique" ON "docman_document_versions" USING btree ("tenantId","documentId","version");--> statement-breakpoint
CREATE INDEX "document_version_idx_doc" ON "docman_document_versions" USING btree ("tenantId","documentId");--> statement-breakpoint
CREATE INDEX "document_version_idx_status" ON "docman_document_versions" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "document_version_idx_current" ON "docman_document_versions" USING btree ("tenantId","documentId","isCurrent");--> statement-breakpoint
CREATE UNIQUE INDEX "section_uid_unique" ON "docman_sections" USING btree ("tenantId","scopeId","sectionUid");--> statement-breakpoint
CREATE INDEX "section_idx_tenant" ON "docman_sections" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "section_idx_scope" ON "docman_sections" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE UNIQUE INDEX "page_uid_unique" ON "docman_pages" USING btree ("tenantId","scopeId","pageUid");--> statement-breakpoint
CREATE INDEX "page_idx_tenant" ON "docman_pages" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "page_idx_scope" ON "docman_pages" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE UNIQUE INDEX "page_version_unique" ON "docman_page_versions" USING btree ("tenantId","pageId","version");--> statement-breakpoint
CREATE INDEX "page_version_idx_page" ON "docman_page_versions" USING btree ("tenantId","pageId");--> statement-breakpoint
CREATE INDEX "page_version_idx_status" ON "docman_page_versions" USING btree ("tenantId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_section_pos_unique" ON "docman_document_section_links" USING btree ("tenantId","documentVersionId","parentLinkId","position");--> statement-breakpoint
CREATE INDEX "doc_section_idx_doc_version" ON "docman_document_section_links" USING btree ("tenantId","documentVersionId");--> statement-breakpoint
CREATE INDEX "doc_section_idx_section" ON "docman_document_section_links" USING btree ("tenantId","sectionId");--> statement-breakpoint
CREATE INDEX "doc_section_idx_page_version" ON "docman_document_section_links" USING btree ("tenantId","pageVersionId");--> statement-breakpoint
CREATE INDEX "doc_section_idx_parent" ON "docman_document_section_links" USING btree ("tenantId","parentLinkId");--> statement-breakpoint
CREATE UNIQUE INDEX "section_page_pos_unique" ON "docman_section_page_links" USING btree ("tenantId","sectionId","position");--> statement-breakpoint
CREATE INDEX "section_page_idx_section" ON "docman_section_page_links" USING btree ("tenantId","sectionId");--> statement-breakpoint
CREATE INDEX "section_page_idx_page_version" ON "docman_section_page_links" USING btree ("tenantId","pageVersionId");--> statement-breakpoint
CREATE UNIQUE INDEX "snippet_uid_unique" ON "docman_snippets" USING btree ("tenantId","scopeId","snippetUid");--> statement-breakpoint
CREATE INDEX "snippet_idx_tenant" ON "docman_snippets" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "snippet_idx_scope" ON "docman_snippets" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "snippet_idx_scope_language" ON "docman_snippets" USING btree ("tenantId","scopeId","language");--> statement-breakpoint
CREATE UNIQUE INDEX "page_snippet_pos_unique" ON "docman_page_snippet_links" USING btree ("tenantId","pageVersionId","position");--> statement-breakpoint
CREATE INDEX "page_snippet_idx_page_version" ON "docman_page_snippet_links" USING btree ("tenantId","pageVersionId");--> statement-breakpoint
CREATE INDEX "page_snippet_idx_snippet" ON "docman_page_snippet_links" USING btree ("tenantId","snippetId");--> statement-breakpoint
CREATE UNIQUE INDEX "embed_uid_unique" ON "docman_embeds" USING btree ("tenantId","scopeId","embedUid");--> statement-breakpoint
CREATE INDEX "embed_idx_tenant" ON "docman_embeds" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "embed_idx_scope" ON "docman_embeds" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "embed_idx_scope_type" ON "docman_embeds" USING btree ("tenantId","scopeId","type");--> statement-breakpoint
CREATE UNIQUE INDEX "page_embed_pos_unique" ON "docman_page_embed_links" USING btree ("tenantId","pageVersionId","position");--> statement-breakpoint
CREATE INDEX "page_embed_idx_page_version" ON "docman_page_embed_links" USING btree ("tenantId","pageVersionId");--> statement-breakpoint
CREATE INDEX "page_embed_idx_embed" ON "docman_page_embed_links" USING btree ("tenantId","embedId");

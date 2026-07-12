ALTER TABLE "docman_document_index_entries" ADD COLUMN "summaryText" text;
--> statement-breakpoint
ALTER TABLE "docman_document_index_entries" ADD COLUMN "sourceCharCount" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "docman_document_index_entries" ADD COLUMN "sourceWordCount" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "docman_document_index_entries" ADD COLUMN "summaryCharCount" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "docman_document_index_entries" ADD COLUMN "summaryWordCount" integer DEFAULT 0 NOT NULL;

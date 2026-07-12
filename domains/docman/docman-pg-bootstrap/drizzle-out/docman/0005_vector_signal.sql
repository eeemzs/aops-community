ALTER TABLE "docman_document_index_entries" ADD COLUMN "embeddingProvider" text;
--> statement-breakpoint
ALTER TABLE "docman_document_index_entries" ADD COLUMN "embeddingModel" text;
--> statement-breakpoint
ALTER TABLE "docman_document_index_entries" ADD COLUMN "embeddingHash" text;
--> statement-breakpoint
ALTER TABLE "docman_document_index_entries" ADD COLUMN "embeddingDimensions" integer;
--> statement-breakpoint
ALTER TABLE "docman_document_index_entries" ADD COLUMN "embeddingVector" text;

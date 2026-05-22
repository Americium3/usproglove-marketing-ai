CREATE TYPE "public"."content_status" AS ENUM('draft', 'ready', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."content_intent" AS ENUM('informational', 'commercial', 'transactional', 'navigational');--> statement-breakpoint
CREATE TYPE "public"."cluster_term_kind" AS ENUM('head', 'long_tail', 'question');--> statement-breakpoint
CREATE TABLE "keyword_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical" "vertical" NOT NULL,
	"seed_term" text NOT NULL,
	"name" text NOT NULL,
	"intent" "content_intent" DEFAULT 'informational' NOT NULL,
	"terms" jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid,
	"vertical" "vertical" NOT NULL,
	"locale" varchar(8) DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"audience" text,
	"intent" "content_intent" DEFAULT 'informational' NOT NULL,
	"target_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outline" jsonb NOT NULL,
	"faqs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cta_sku_id" varchar(32),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_piece_id" uuid NOT NULL,
	"to_piece_id" uuid,
	"to_url" text NOT NULL,
	"anchor_text" text NOT NULL,
	"kind" varchar(32) DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_cluster_id_keyword_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."keyword_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_links" ADD CONSTRAINT "content_links_from_piece_id_content_pieces_id_fk" FOREIGN KEY ("from_piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_links" ADD CONSTRAINT "content_links_to_piece_id_content_pieces_id_fk" FOREIGN KEY ("to_piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_clusters_vertical_idx" ON "keyword_clusters" USING btree ("vertical");--> statement-breakpoint
CREATE INDEX "keyword_clusters_seed_idx" ON "keyword_clusters" USING btree ("seed_term");--> statement-breakpoint
CREATE INDEX "content_briefs_vertical_idx" ON "content_briefs" USING btree ("vertical");--> statement-breakpoint
CREATE INDEX "content_briefs_cluster_idx" ON "content_briefs" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "content_links_from_idx" ON "content_links" USING btree ("from_piece_id");--> statement-breakpoint
CREATE INDEX "content_links_to_idx" ON "content_links" USING btree ("to_piece_id");--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "status" "content_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "cluster_id" uuid REFERENCES "public"."keyword_clusters"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "brief_id" uuid REFERENCES "public"."content_briefs"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "excerpt" text;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "seo_title" text;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "canonical_url" text;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "og_image_url" text;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "json_ld" jsonb;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "word_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "internal_link_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "external_link_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "last_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD COLUMN "intent" "content_intent" DEFAULT 'informational' NOT NULL;--> statement-breakpoint
UPDATE "content_pieces" SET "status" = 'published' WHERE "published" = true;--> statement-breakpoint
CREATE INDEX "content_pieces_status_idx" ON "content_pieces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_pieces_scheduled_idx" ON "content_pieces" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "content_pieces_vertical_locale_idx" ON "content_pieces" USING btree ("vertical", "locale");

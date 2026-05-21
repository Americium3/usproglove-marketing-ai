CREATE TYPE "public"."crm_task_status" AS ENUM('open', 'done', 'snoozed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('lead', 'qualified', 'opportunity', 'customer', 'closed_lost');--> statement-breakpoint
CREATE TABLE "crm_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prospect_id" uuid,
	"author_email" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prospect_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"status" "crm_task_status" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"assignee_email" text,
	"completed_at" timestamp with time zone,
	"created_by_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "deal_stage" "deal_stage" DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "background" text;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_notes_company_idx" ON "crm_notes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_notes_prospect_idx" ON "crm_notes" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "crm_notes_created_idx" ON "crm_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_company_idx" ON "crm_tasks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_prospect_idx" ON "crm_tasks" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_status_due_idx" ON "crm_tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "companies_deal_stage_idx" ON "companies" USING btree ("deal_stage");
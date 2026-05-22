import { pgTable, pgEnum, text, varchar, integer, timestamp, jsonb, uuid, boolean, index, numeric, vector } from "drizzle-orm/pg-core";

export const verticalEnum = pgEnum("vertical", [
  "tattoo",
  "beauty",
  "restaurant",
  "medical",
  "industrial",
  "automotive",
  "agriculture",
  "janitorial",
  "cannabis",
  "veterinary",
  "supplier",
]);

export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "active", "paused", "archived"]);
export const dealStageEnum = pgEnum("deal_stage", [
  "lead",
  "qualified",
  "opportunity",
  "customer",
  "closed_lost",
]);
export const crmTaskStatusEnum = pgEnum("crm_task_status", [
  "open",
  "done",
  "snoozed",
  "cancelled",
]);
export const prospectStatusEnum = pgEnum("prospect_status", [
  "discovered",
  "enriching",
  "enriched",
  "ready",
  "sending",
  "sent",
  "replied",
  "bounced",
  "suppressed",
  "unsubscribed",
]);
export const messageDirectionEnum = pgEnum("message_direction", ["outbound", "inbound"]);
export const messageKindEnum = pgEnum("message_kind", ["first_touch", "follow_up_1", "follow_up_2", "reply", "handoff"]);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    website: text("website"),
    phone: text("phone"),
    addressLine: text("address_line"),
    city: text("city"),
    region: varchar("region", { length: 32 }),
    countryCode: varchar("country_code", { length: 2 }).default("US"),
    vertical: verticalEnum("vertical").notNull(),
    subVertical: varchar("sub_vertical", { length: 64 }),
    googlePlaceId: text("google_place_id").unique(),
    rating: integer("rating"),
    reviewCount: integer("review_count"),
    discoverySourceId: varchar("discovery_source_id", { length: 32 }).notNull(),
    dealStage: dealStageEnum("deal_stage").default("lead").notNull(),
    background: text("background"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    verticalIdx: index("companies_vertical_idx").on(t.vertical),
    regionIdx: index("companies_region_idx").on(t.region),
    dealStageIdx: index("companies_deal_stage_idx").on(t.dealStage),
  }),
);

export const prospects = pgTable(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    role: text("role"),
    status: prospectStatusEnum("status").default("discovered").notNull(),
    score: integer("score"),
    enrichmentSourceId: varchar("enrichment_source_id", { length: 32 }),
    enrichmentConfidence: integer("enrichment_confidence"),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }),
    suppressionReason: text("suppression_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: index("prospects_email_idx").on(t.email),
    statusIdx: index("prospects_status_idx").on(t.status),
  }),
);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vertical: verticalEnum("vertical").notNull(),
  heroSkuId: varchar("hero_sku_id", { length: 32 }).notNull(),
  status: campaignStatusEnum("status").default("draft").notNull(),
  dailyCap: integer("daily_cap").default(10).notNull(),
  contactsPerCompany: integer("contacts_per_company").default(3).notNull(),
  icp: jsonb("icp").$type<Record<string, unknown>>(),
  promptTemplate: text("prompt_template").notNull(),
  senderEmail: text("sender_email").notNull(),
  senderName: text("sender_name").notNull(),
  replyToEmail: text("reply_to_email").notNull(),
  signatureText: text("signature_text"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id").references(() => prospects.id, { onDelete: "cascade" }).notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    kind: messageKindEnum("kind").notNull(),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    messageId: text("message_id").unique(),
    inReplyTo: text("in_reply_to"),
    providerMessageId: text("provider_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    prospectIdx: index("messages_prospect_idx").on(t.prospectId),
    inReplyToIdx: index("messages_in_reply_to_idx").on(t.inReplyTo),
  }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id").references(() => prospects.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindIdx: index("events_kind_idx").on(t.kind),
  }),
);

// `contentPieces` is defined further down (Phase 2.4 extended shape).

export const suppressions = pgTable("suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  reason: varchar("reason", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiTaskEnum = pgEnum("ai_task", ["score", "draft", "research", "extract"]);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    task: aiTaskEnum("task").notNull(),
    modelId: varchar("model_id", { length: 64 }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    durationMs: integer("duration_ms").notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    prospectId: uuid("prospect_id").references(() => prospects.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    errored: boolean("errored").default(false).notNull(),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    taskIdx: index("ai_usage_task_idx").on(t.task),
    createdIdx: index("ai_usage_created_idx").on(t.createdAt),
    campaignIdx: index("ai_usage_campaign_idx").on(t.campaignId),
  }),
);

export const usageSnapshotKindEnum = pgEnum("usage_snapshot_kind", [
  "db_total_size_bytes",
  "table_row_count",
  "table_size_bytes",
  "brevo_daily_remaining",
  "brevo_credits_remaining",
  "hunter_searches_remaining",
  "hunter_verifications_remaining",
  "snov_credits_remaining",
  "ai_daily_cost_usd",
  "blob_size_bytes",
]);

export const usageSnapshots = pgTable(
  "usage_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: usageSnapshotKindEnum("kind").notNull(),
    scope: varchar("scope", { length: 128 }),
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
    unit: varchar("unit", { length: 16 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindIdx: index("usage_snapshots_kind_idx").on(t.kind),
    createdIdx: index("usage_snapshots_created_idx").on(t.createdAt),
  }),
);

export const crmNotes = pgTable(
  "crm_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    prospectId: uuid("prospect_id").references(() => prospects.id, { onDelete: "set null" }),
    authorEmail: text("author_email").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("crm_notes_company_idx").on(t.companyId),
    prospectIdx: index("crm_notes_prospect_idx").on(t.prospectId),
    createdIdx: index("crm_notes_created_idx").on(t.createdAt),
  }),
);

export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    prospectId: uuid("prospect_id").references(() => prospects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body"),
    status: crmTaskStatusEnum("status").default("open").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assigneeEmail: text("assignee_email"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("crm_tasks_company_idx").on(t.companyId),
    prospectIdx: index("crm_tasks_prospect_idx").on(t.prospectId),
    statusDueIdx: index("crm_tasks_status_due_idx").on(t.status, t.dueAt),
  }),
);

export const cronRunStatusEnum = pgEnum("cron_run_status", ["running", "success", "error"]);
export const cronRunTriggerEnum = pgEnum("cron_run_trigger", ["scheduled", "manual", "retry"]);

export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: varchar("job", { length: 64 }).notNull(),
    status: cronRunStatusEnum("status").notNull().default("running"),
    triggeredBy: cronRunTriggerEnum("triggered_by").notNull().default("scheduled"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (t) => ({
    jobStartedIdx: index("cron_runs_job_started_idx").on(t.job, t.startedAt),
    startedIdx: index("cron_runs_started_idx").on(t.startedAt),
  }),
);

// ─── Knowledge base (Phase 2) ────────────────────────────────────────────────
//
// Knowledge sources are user-uploaded references the AI can retrieve when
// drafting outreach or answering operator questions. Each source is split into
// ~500-token chunks; each chunk gets a 1536-dim embedding (OpenAI text-embedding-3-small
// via Vercel AI Gateway) and is indexed with pgvector HNSW for cosine ANN search.
//
// MVP scope: `text` and `mdx` kinds — paste content directly. URL/PDF kinds
// reserved in the enum so future ingestion paths can add rows without a schema
// migration.

export const knowledgeSourceKindEnum = pgEnum("knowledge_source_kind", [
  "text",
  "mdx",
  "url",
  "pdf",
]);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    kind: knowledgeSourceKindEnum("kind").notNull().default("text"),
    vertical: verticalEnum("vertical"),
    category: varchar("category", { length: 64 }),
    sourceUrl: text("source_url"),
    rawContent: text("raw_content").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    verticalIdx: index("knowledge_sources_vertical_idx").on(t.vertical),
    categoryIdx: index("knowledge_sources_category_idx").on(t.category),
  }),
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .references(() => knowledgeSources.id, { onDelete: "cascade" })
      .notNull(),
    ord: integer("ord").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceIdx: index("knowledge_chunks_source_idx").on(t.sourceId),
    embeddingIdx: index("knowledge_chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  }),
);

// ─── Content & SEO engine (Phase 2.4) ────────────────────────────────────────
//
// A keyword cluster groups a seed term ("tattoo gloves") into related search
// queries (head + long-tail + question intent). One cluster typically becomes
// one article. A brief is the structured outline + KB citations consumed by the
// drafter; a piece is the final article body + SEO + status row.

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "ready",
  "scheduled",
  "published",
  "archived",
]);
export const contentIntentEnum = pgEnum("content_intent", [
  "informational",
  "commercial",
  "transactional",
  "navigational",
]);
export const clusterTermKindEnum = pgEnum("cluster_term_kind", [
  "head",
  "long_tail",
  "question",
]);

export const keywordClusters = pgTable(
  "keyword_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vertical: verticalEnum("vertical").notNull(),
    seedTerm: text("seed_term").notNull(),
    name: text("name").notNull(),
    intent: contentIntentEnum("intent").notNull().default("informational"),
    terms: jsonb("terms")
      .$type<Array<{ term: string; kind: "head" | "long_tail" | "question"; volume?: number | null }>>()
      .notNull(),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    verticalIdx: index("keyword_clusters_vertical_idx").on(t.vertical),
    seedIdx: index("keyword_clusters_seed_idx").on(t.seedTerm),
  }),
);

export const contentBriefs = pgTable(
  "content_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clusterId: uuid("cluster_id").references(() => keywordClusters.id, { onDelete: "set null" }),
    vertical: verticalEnum("vertical").notNull(),
    locale: varchar("locale", { length: 8 }).notNull().default("en"),
    title: text("title").notNull(),
    audience: text("audience"),
    intent: contentIntentEnum("intent").notNull().default("informational"),
    targetKeywords: jsonb("target_keywords").$type<string[]>().notNull().default([]),
    outline: jsonb("outline")
      .$type<Array<{ heading: string; bullets: string[]; kbCitations?: Array<{ sourceId: string; ord: number }> }>>()
      .notNull(),
    faqs: jsonb("faqs").$type<Array<{ q: string; a: string }>>().notNull().default([]),
    ctaSkuId: varchar("cta_sku_id", { length: 32 }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    verticalIdx: index("content_briefs_vertical_idx").on(t.vertical),
    clusterIdx: index("content_briefs_cluster_idx").on(t.clusterId),
  }),
);

// Phase 2.4 extends the original content_pieces table with status, SEO,
// scheduling, JSON-LD, and link-audit columns. The legacy `published` boolean
// is preserved and mirrored from the status enum for back-compat; new code
// should read `status`.
export const contentPieces = pgTable(
  "content_pieces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    vertical: verticalEnum("vertical").notNull(),
    locale: varchar("locale", { length: 8 }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    bodyMdx: text("body_mdx").notNull(),
    heroSkuId: varchar("hero_sku_id", { length: 32 }),
    keywords: jsonb("keywords").$type<string[]>(),
    published: boolean("published").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    // Phase 2.4 additions
    status: contentStatusEnum("status").default("draft").notNull(),
    clusterId: uuid("cluster_id").references(() => keywordClusters.id, { onDelete: "set null" }),
    briefId: uuid("brief_id").references(() => contentBriefs.id, { onDelete: "set null" }),
    excerpt: text("excerpt"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalUrl: text("canonical_url"),
    ogImageUrl: text("og_image_url"),
    jsonLd: jsonb("json_ld").$type<Record<string, unknown> | null>(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    wordCount: integer("word_count").default(0).notNull(),
    internalLinkCount: integer("internal_link_count").default(0).notNull(),
    externalLinkCount: integer("external_link_count").default(0).notNull(),
    lastLinkedAt: timestamp("last_linked_at", { withTimezone: true }),
    intent: contentIntentEnum("intent").default("informational").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("content_pieces_status_idx").on(t.status),
    scheduledIdx: index("content_pieces_scheduled_idx").on(t.scheduledAt),
    verticalLocaleIdx: index("content_pieces_vertical_locale_idx").on(t.vertical, t.locale),
  }),
);

// Internal-link graph: one row per (source piece → target piece) link inserted
// by the weaver. Lets us answer "who links to X?" and find orphans.
export const contentLinks = pgTable(
  "content_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromPieceId: uuid("from_piece_id")
      .references(() => contentPieces.id, { onDelete: "cascade" })
      .notNull(),
    toPieceId: uuid("to_piece_id").references(() => contentPieces.id, {
      onDelete: "cascade",
    }),
    toUrl: text("to_url").notNull(),
    anchorText: text("anchor_text").notNull(),
    kind: varchar("kind", { length: 32 }).notNull().default("internal"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    fromIdx: index("content_links_from_idx").on(t.fromPieceId),
    toIdx: index("content_links_to_idx").on(t.toPieceId),
  }),
);

import { z } from "zod";
import { trackedGenerateObject } from "@/lib/ai/track";
import { db, schema } from "@/lib/db";
import { verticalProfile, type ContentVertical } from "./verticals";

const ClusterSchema = z.object({
  name: z.string().min(2).max(120),
  intent: z.enum(["informational", "commercial", "transactional", "navigational"]),
  terms: z
    .array(
      z.object({
        term: z.string().min(2).max(120),
        kind: z.enum(["head", "long_tail", "question"]),
      }),
    )
    .min(6)
    .max(40),
});

const ClustersBatchSchema = z.object({
  clusters: z.array(ClusterSchema).min(1).max(8),
});

export type GeneratedCluster = z.infer<typeof ClusterSchema>;

export async function generateClusters(args: {
  vertical: ContentVertical;
  seedTerm: string;
  count?: number;
}): Promise<GeneratedCluster[]> {
  const profile = verticalProfile(args.vertical);
  const count = args.count ?? 3;

  const prompt = `You are an SEO strategist for USProGlove (B2B nitrile gloves).

Vertical: ${profile.label}
Audience: ${profile.audience}
Seed term: "${args.seedTerm}"

Produce ${count} keyword cluster(s). Each cluster represents one future article
and groups closely related search queries by intent.

For each cluster:
- name: short topic title (e.g., "5 mil black gloves for tattoo artists")
- intent: informational | commercial | transactional | navigational
- terms: 8–20 queries split between head (broad), long_tail (specific 3+ words),
  question (starts with how/what/why/are/do/can/which).

Bias toward terms a US buyer would actually search. Do not invent product names.
Use natural English; mix singular and plural; include comparison phrases where
relevant ("vs latex", "for sensitive skin").`;

  const result = await trackedGenerateObject({
    task: "extract",
    modelKey: "fast",
    schema: ClustersBatchSchema,
    prompt,
    metadata: { feature: "content.clusters", vertical: args.vertical, seedTerm: args.seedTerm },
  });

  return result.object.clusters;
}

export async function saveCluster(args: {
  vertical: ContentVertical;
  seedTerm: string;
  cluster: GeneratedCluster;
  createdBy?: string;
}) {
  const [row] = await db
    .insert(schema.keywordClusters)
    .values({
      vertical: args.vertical,
      seedTerm: args.seedTerm,
      name: args.cluster.name,
      intent: args.cluster.intent,
      terms: args.cluster.terms,
      createdBy: args.createdBy,
    })
    .returning({ id: schema.keywordClusters.id });
  return row.id;
}

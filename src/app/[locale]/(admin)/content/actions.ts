"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { checkAdmin } from "@/lib/auth/admin";
import {
  generateClusters,
  saveCluster,
  type GeneratedCluster,
} from "@/lib/content/clusters";
import { buildBriefFromKb, saveBrief } from "@/lib/content/brief";
import { draftFromBrief, regenerateSection, countWords } from "@/lib/content/draft";
import { generateSeoMeta } from "@/lib/content/seo";
import { weaveInternalLinks } from "@/lib/content/internalLinks";
import { publishPieceNow, schedulePiece, unpublishPiece } from "@/lib/content/publish";
import { uniqueSlug } from "@/lib/content/slug";
import { isContentVertical, type ContentVertical } from "@/lib/content/verticals";

type SuccessResult<T = Record<string, unknown>> = { ok: true } & T;
type FailureResult = { ok: false; error: string };
type Result<T = Record<string, unknown>> = SuccessResult<T> | FailureResult;

async function adminOrFail(): Promise<{ email: string } | { error: string }> {
  const a = await checkAdmin();
  if (!a.ok) return { error: "unauthorized" };
  return { email: a.email };
}

const GenerateClustersSchema = z.object({
  vertical: z.string(),
  seedTerm: z.string().min(2).max(120),
  count: z.coerce.number().int().min(1).max(8).optional(),
});

export async function actionGenerateClusters(
  formData: FormData,
): Promise<Result<{ clusters: GeneratedCluster[]; vertical: string; seedTerm: string }>> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  const parsed = GenerateClustersSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const vertical = isContentVertical(parsed.data.vertical) ? parsed.data.vertical : null;
  if (!vertical) return { ok: false, error: "invalid_vertical" };

  try {
    const clusters = await generateClusters({
      vertical,
      seedTerm: parsed.data.seedTerm,
      count: parsed.data.count,
    });
    return { ok: true, clusters, vertical, seedTerm: parsed.data.seedTerm };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function actionSaveClusters(payload: {
  vertical: string;
  seedTerm: string;
  clusters: GeneratedCluster[];
}): Promise<Result<{ ids: string[] }>> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  if (!isContentVertical(payload.vertical)) return { ok: false, error: "invalid_vertical" };

  try {
    const ids: string[] = [];
    for (const cluster of payload.clusters) {
      ids.push(
        await saveCluster({
          vertical: payload.vertical,
          seedTerm: payload.seedTerm,
          cluster,
          createdBy: a.email,
        }),
      );
    }
    revalidatePath("/content");
    revalidatePath("/content/clusters");
    return { ok: true, ids };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function actionDeleteCluster(clusterId: string): Promise<Result> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  await db.delete(schema.keywordClusters).where(eq(schema.keywordClusters.id, clusterId));
  revalidatePath("/content/clusters");
  return { ok: true };
}

const GenerateBriefSchema = z.object({
  clusterId: z.string().uuid(),
  locale: z.string().min(2).max(8).optional(),
});

export async function actionGenerateBrief(formData: FormData): Promise<Result<{ briefId: string }>> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  const parsed = GenerateBriefSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const [cluster] = await db
    .select()
    .from(schema.keywordClusters)
    .where(eq(schema.keywordClusters.id, parsed.data.clusterId))
    .limit(1);
  if (!cluster) return { ok: false, error: "cluster_not_found" };
  const vertical = cluster.vertical as ContentVertical;
  if (!isContentVertical(vertical)) return { ok: false, error: "invalid_vertical" };

  const seedQuery = [cluster.name, ...cluster.terms.slice(0, 6).map((t) => t.term)].join(" — ");
  try {
    const built = await buildBriefFromKb({
      clusterId: cluster.id,
      vertical,
      locale: parsed.data.locale ?? "en",
      seedQuery,
    });
    const briefId = await saveBrief({
      clusterId: cluster.id,
      vertical,
      locale: parsed.data.locale ?? "en",
      built,
      intent: cluster.intent,
      createdBy: a.email,
    });
    revalidatePath("/content");
    return { ok: true, briefId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function actionDraftFromBrief(briefId: string): Promise<Result<{ pieceId: string; slug: string }>> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  try {
    const { pieceId, slug } = await draftFromBrief({ briefId });
    revalidatePath("/content");
    return { ok: true, pieceId, slug };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const SavePieceSchema = z.object({
  pieceId: z.string().uuid(),
  title: z.string().min(4).max(200),
  excerpt: z.string().max(280).optional(),
  bodyMdx: z.string().min(20),
  heroSkuId: z.string().max(32).optional(),
  seoTitle: z.string().max(80).optional(),
  seoDescription: z.string().max(200).optional(),
  keywords: z.string().optional(),
});

export async function actionSavePiece(formData: FormData): Promise<Result> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  const raw = Object.fromEntries(formData);
  const parsed = SavePieceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const keywords = (parsed.data.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  await db
    .update(schema.contentPieces)
    .set({
      title: parsed.data.title,
      excerpt: parsed.data.excerpt ?? null,
      description: parsed.data.excerpt ?? null,
      bodyMdx: parsed.data.bodyMdx,
      heroSkuId: parsed.data.heroSkuId || null,
      seoTitle: parsed.data.seoTitle ?? null,
      seoDescription: parsed.data.seoDescription ?? null,
      keywords: keywords.length > 0 ? keywords : null,
      wordCount: countWords(parsed.data.bodyMdx),
      updatedAt: new Date(),
    })
    .where(eq(schema.contentPieces.id, parsed.data.pieceId));
  revalidatePath(`/content/${parsed.data.pieceId}`);
  revalidatePath("/content");
  return { ok: true };
}

const RegenSectionSchema = z.object({
  pieceId: z.string().uuid(),
  heading: z.string().min(2),
  instruction: z.string().max(400).optional(),
});

export async function actionRegenSection(formData: FormData): Promise<Result> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  const parsed = RegenSectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  try {
    await regenerateSection(parsed.data);
    revalidatePath(`/content/${parsed.data.pieceId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function actionRegenSeo(pieceId: string): Promise<Result> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  try {
    await generateSeoMeta(pieceId);
    revalidatePath(`/content/${pieceId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function actionWeaveLinks(pieceId: string): Promise<Result<{ inserted: number }>> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  try {
    const r = await weaveInternalLinks(pieceId);
    revalidatePath(`/content/${pieceId}`);
    return { ok: true, inserted: r.inserted };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function actionPublishNow(pieceId: string): Promise<Result> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  try {
    await publishPieceNow(pieceId);
    revalidatePath(`/content/${pieceId}`);
    revalidatePath("/content");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const ScheduleSchema = z.object({
  pieceId: z.string().uuid(),
  scheduledAt: z.string().min(10),
});

export async function actionSchedule(formData: FormData): Promise<Result> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  const parsed = ScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const when = new Date(parsed.data.scheduledAt);
  if (isNaN(when.getTime())) return { ok: false, error: "invalid_date" };
  try {
    await schedulePiece(parsed.data.pieceId, when);
    revalidatePath(`/content/${parsed.data.pieceId}`);
    revalidatePath("/content");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function actionUnpublish(pieceId: string): Promise<Result> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  await unpublishPiece(pieceId);
  revalidatePath(`/content/${pieceId}`);
  revalidatePath("/content");
  return { ok: true };
}

export async function actionDeletePiece(pieceId: string): Promise<Result> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  await db.delete(schema.contentPieces).where(eq(schema.contentPieces.id, pieceId));
  revalidatePath("/content");
  return { ok: true };
}

const ManualCreateSchema = z.object({
  vertical: z.string(),
  locale: z.string().min(2).max(8).default("en"),
  title: z.string().min(4).max(200),
  bodyMdx: z.string().min(20),
  excerpt: z.string().max(280).optional(),
  heroSkuId: z.string().max(32).optional(),
  keywords: z.string().optional(),
});

export async function actionCreateManualPiece(formData: FormData): Promise<Result<{ pieceId: string }>> {
  const a = await adminOrFail();
  if ("error" in a) return { ok: false, error: a.error };
  const parsed = ManualCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  if (!isContentVertical(parsed.data.vertical)) return { ok: false, error: "invalid_vertical" };

  const slug = await uniqueSlug(parsed.data.title, parsed.data.locale);
  const keywords = (parsed.data.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const [piece] = await db
    .insert(schema.contentPieces)
    .values({
      slug,
      vertical: parsed.data.vertical,
      locale: parsed.data.locale,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      description: parsed.data.excerpt,
      bodyMdx: parsed.data.bodyMdx,
      heroSkuId: parsed.data.heroSkuId || undefined,
      keywords: keywords.length > 0 ? keywords : null,
      status: "draft",
      wordCount: countWords(parsed.data.bodyMdx),
    })
    .returning({ id: schema.contentPieces.id });

  revalidatePath("/content");
  return { ok: true, pieceId: piece.id };
}

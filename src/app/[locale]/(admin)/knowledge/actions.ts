"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schema } from "@/lib/db";
import { checkAdmin } from "@/lib/auth/admin";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestSource, reingestSource, deleteSource } from "@/lib/knowledge/ingest";
import { fetchUrlAsText } from "@/lib/knowledge/fetch";
import { extractPdfText } from "@/lib/knowledge/pdf";
import { autoTagKnowledge } from "@/lib/knowledge/autotag";

async function resolveTags(args: {
  title: string;
  text: string;
  vertical?: (typeof schema.verticalEnum.enumValues)[number];
  category?: string;
}): Promise<{
  vertical?: (typeof schema.verticalEnum.enumValues)[number];
  category?: string;
  autoTagged: { vertical: boolean; category: boolean };
}> {
  const needsVertical = !args.vertical;
  const needsCategory = !args.category;
  if (!needsVertical && !needsCategory) {
    return { vertical: args.vertical, category: args.category, autoTagged: { vertical: false, category: false } };
  }
  const inferred = await autoTagKnowledge({ title: args.title, text: args.text });
  return {
    vertical: args.vertical ?? inferred.vertical ?? undefined,
    category: args.category ?? inferred.category ?? undefined,
    autoTagged: {
      vertical: needsVertical && !!inferred.vertical,
      category: needsCategory && !!inferred.category,
    },
  };
}

type SuccessResult<T> = { ok: true } & T;
type FailureResult = { ok: false; error: string };
type EmptyResult = { ok: true };

const VerticalEnum = z.enum(schema.verticalEnum.enumValues);
const KindEnum = z.enum(schema.knowledgeSourceKindEnum.enumValues);

const CreateSchema = z.object({
  title: z.string().min(2).max(200),
  kind: KindEnum.optional(),
  vertical: VerticalEnum.optional(),
  category: z.string().max(64).optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  rawContent: z.string().min(20).max(200_000),
});

export async function createKnowledgeSource(
  formData: FormData,
): Promise<SuccessResult<{ sourceId: string; chunkCount: number }> | FailureResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };

  const raw = {
    title: formData.get("title")?.toString() ?? "",
    kind: formData.get("kind")?.toString() || undefined,
    vertical: formData.get("vertical")?.toString() || undefined,
    category: formData.get("category")?.toString() || undefined,
    sourceUrl: formData.get("sourceUrl")?.toString() || undefined,
    rawContent: formData.get("rawContent")?.toString() ?? "",
  };

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  try {
    const tags = await resolveTags({
      title: parsed.data.title,
      text: parsed.data.rawContent,
      vertical: parsed.data.vertical,
      category: parsed.data.category,
    });
    const result = await ingestSource({
      title: parsed.data.title,
      kind: parsed.data.kind,
      vertical: tags.vertical,
      category: tags.category,
      sourceUrl: parsed.data.sourceUrl || undefined,
      rawContent: parsed.data.rawContent,
      createdBy: auth.email,
    });
    revalidatePath("/[locale]/(admin)/knowledge", "page");
    return { ok: true, sourceId: result.sourceId, chunkCount: result.chunkCount };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const UrlIngestSchema = z.object({
  url: z.string().url(),
  vertical: VerticalEnum.optional(),
  category: z.string().max(64).optional(),
  titleOverride: z.string().max(200).optional(),
});

export async function createKnowledgeSourceFromUrl(
  formData: FormData,
): Promise<SuccessResult<{ sourceId: string; chunkCount: number; title: string }> | FailureResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };

  const raw = {
    url: formData.get("url")?.toString() ?? "",
    vertical: formData.get("vertical")?.toString() || undefined,
    category: formData.get("category")?.toString() || undefined,
    titleOverride: formData.get("titleOverride")?.toString() || undefined,
  };

  const parsed = UrlIngestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  try {
    const page = await fetchUrlAsText(parsed.data.url);
    if (page.text.length < 100) {
      return { ok: false, error: "fetched_page_too_short" };
    }
    const tags = await resolveTags({
      title: parsed.data.titleOverride || page.title,
      text: page.text,
      vertical: parsed.data.vertical,
      category: parsed.data.category,
    });
    const result = await ingestSource({
      title: parsed.data.titleOverride || page.title,
      kind: "url",
      vertical: tags.vertical,
      category: tags.category,
      sourceUrl: page.finalUrl,
      rawContent: page.text,
      createdBy: auth.email,
    });
    revalidatePath("/[locale]/(admin)/knowledge", "page");
    return { ok: true, sourceId: result.sourceId, chunkCount: result.chunkCount, title: page.title };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const PdfMetaSchema = z.object({
  vertical: VerticalEnum.optional(),
  category: z.string().max(64).optional(),
  titleOverride: z.string().max(200).optional(),
});

export async function createKnowledgeSourceFromPdf(
  formData: FormData,
): Promise<SuccessResult<{ sourceId: string; chunkCount: number; title: string; pageCount: number }> | FailureResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "no_file" };
  if (file.size === 0) return { ok: false, error: "empty_file" };
  if (!/pdf/i.test(file.type) && !file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "not_a_pdf" };
  }

  const metaParse = PdfMetaSchema.safeParse({
    vertical: formData.get("vertical")?.toString() || undefined,
    category: formData.get("category")?.toString() || undefined,
    titleOverride: formData.get("titleOverride")?.toString() || undefined,
  });
  if (!metaParse.success) {
    return { ok: false, error: metaParse.error.issues[0]?.message ?? "invalid_input" };
  }

  try {
    const buf = await file.arrayBuffer();
    const fallbackTitle = metaParse.data.titleOverride || file.name.replace(/\.pdf$/i, "");
    const extracted = await extractPdfText(buf, fallbackTitle);
    if (extracted.text.length < 100) {
      return { ok: false, error: "pdf_text_too_short" };
    }
    const tags = await resolveTags({
      title: extracted.title,
      text: extracted.text,
      vertical: metaParse.data.vertical,
      category: metaParse.data.category,
    });
    const result = await ingestSource({
      title: extracted.title,
      kind: "pdf",
      vertical: tags.vertical,
      category: tags.category,
      rawContent: extracted.text,
      createdBy: auth.email,
    });
    revalidatePath("/[locale]/(admin)/knowledge", "page");
    return {
      ok: true,
      sourceId: result.sourceId,
      chunkCount: result.chunkCount,
      title: extracted.title,
      pageCount: extracted.pageCount,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function reingestKnowledgeSource(
  sourceId: string,
): Promise<SuccessResult<{ chunkCount: number; kind: string }> | FailureResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };

  const idParse = z.string().uuid().safeParse(sourceId);
  if (!idParse.success) return { ok: false, error: "invalid_id" };

  try {
    const [source] = await db
      .select({
        id: schema.knowledgeSources.id,
        kind: schema.knowledgeSources.kind,
        sourceUrl: schema.knowledgeSources.sourceUrl,
        title: schema.knowledgeSources.title,
        rawContent: schema.knowledgeSources.rawContent,
      })
      .from(schema.knowledgeSources)
      .where(eq(schema.knowledgeSources.id, sourceId))
      .limit(1);

    if (!source) return { ok: false, error: "not_found" };

    let newContent = source.rawContent;
    if (source.kind === "url") {
      if (!source.sourceUrl) return { ok: false, error: "missing_source_url" };
      const page = await fetchUrlAsText(source.sourceUrl);
      if (page.text.length < 100) return { ok: false, error: "fetched_page_too_short" };
      newContent = page.text;
    }
    // For text / mdx / pdf: we don't have the original file/buffer; re-chunk
    // and re-embed the stored rawContent. PDFs uploaded via the form already
    // have the extracted text stored in rawContent, so this still refreshes
    // chunks if the chunker / embedder changes.

    const result = await reingestSource(sourceId, newContent);
    revalidatePath("/[locale]/(admin)/knowledge", "page");
    revalidatePath(`/[locale]/(admin)/knowledge/${sourceId}`, "page");
    return { ok: true, chunkCount: result.chunkCount, kind: source.kind };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteKnowledgeSource(sourceId: string): Promise<EmptyResult | FailureResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };

  const idParse = z.string().uuid().safeParse(sourceId);
  if (!idParse.success) return { ok: false, error: "invalid_id" };

  try {
    await deleteSource(sourceId);
    revalidatePath("/[locale]/(admin)/knowledge", "page");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

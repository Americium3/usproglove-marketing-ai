"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schema } from "@/lib/db";
import { checkAdmin } from "@/lib/auth/admin";
import { ingestSource, deleteSource } from "@/lib/knowledge/ingest";
import { fetchUrlAsText } from "@/lib/knowledge/fetch";

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
    const result = await ingestSource({
      title: parsed.data.title,
      kind: parsed.data.kind,
      vertical: parsed.data.vertical,
      category: parsed.data.category,
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
    const result = await ingestSource({
      title: parsed.data.titleOverride || page.title,
      kind: "url",
      vertical: parsed.data.vertical,
      category: parsed.data.category,
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

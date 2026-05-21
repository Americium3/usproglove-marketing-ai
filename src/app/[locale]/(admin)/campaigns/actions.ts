"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { checkAdmin } from "@/lib/auth/admin";
import { verticalEnum, campaignStatusEnum } from "@/lib/db/schema";
import { products, heroSkuByVertical, type Vertical } from "@/../content/catalog/products";
import { IcpSchema, type IcpConfig } from "@/lib/workflow/icp";

const VERTICALS = verticalEnum.enumValues;
const STATUSES = campaignStatusEnum.enumValues;
const PRODUCT_IDS = products.map((p) => p.id) as [string, ...string[]];

const BaseCampaignSchema = z.object({
  name: z.string().min(2).max(120),
  vertical: z.enum(VERTICALS as unknown as [string, ...string[]]),
  heroSkuId: z.enum(PRODUCT_IDS),
  dailyCap: z.coerce.number().int().min(1).max(500),
  contactsPerCompany: z.coerce.number().int().min(1).max(10),
  senderEmail: z.email(),
  senderName: z.string().min(1).max(120),
  replyToEmail: z.email(),
  signatureText: z.string().max(2000).optional(),
  status: z.enum(STATUSES as unknown as [string, ...string[]]),
});

export type CreateCampaignState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const DEFAULT_PROMPT_TEMPLATE =
  "(workflow uses built-in draft prompt; this field is reserved for future per-campaign overrides)";

function parseCsv(raw: FormDataEntryValue | null): string[] | undefined {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return undefined;
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseNumberOrNull(raw: FormDataEntryValue | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function icpFromForm(formData: FormData): IcpConfig | null {
  const description = (formData.get("icpDescription") as string | null)?.trim();
  const raw = {
    description: description ? description : undefined,
    cities: parseCsv(formData.get("icpCities")),
    excludeKeywords: parseCsv(formData.get("icpExcludeKeywords")),
    preferredRoles: parseCsv(formData.get("icpPreferredRoles")),
    minReviewCount: parseNumberOrNull(formData.get("icpMinReviews")),
    minRating: parseNumberOrNull(formData.get("icpMinRating")),
  };
  const hasAny = Object.values(raw).some((v) => v !== undefined);
  if (!hasAny) return null;
  const parsed = IcpSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseBase(formData: FormData) {
  const rawSig = formData.get("signatureText");
  const signatureText = typeof rawSig === "string" && rawSig.trim() ? rawSig.trim() : undefined;
  return BaseCampaignSchema.safeParse({
    name: formData.get("name"),
    vertical: formData.get("vertical"),
    heroSkuId: formData.get("heroSkuId"),
    dailyCap: formData.get("dailyCap"),
    contactsPerCompany: formData.get("contactsPerCompany"),
    senderEmail: formData.get("senderEmail"),
    senderName: formData.get("senderName"),
    replyToEmail: formData.get("replyToEmail"),
    signatureText,
    status: formData.get("status"),
  });
}

export async function createCampaign(
  _prev: CreateCampaignState,
  formData: FormData,
): Promise<CreateCampaignState> {
  const check = await checkAdmin();
  if (!check.ok) return { ok: false, error: "forbidden" };

  const parsed = parseBase(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  const icp = icpFromForm(formData);

  await db.insert(schema.campaigns).values({
    name: v.name,
    vertical: v.vertical as Vertical,
    heroSkuId: v.heroSkuId || heroSkuByVertical[v.vertical as Vertical],
    status: v.status as (typeof STATUSES)[number],
    dailyCap: v.dailyCap,
    contactsPerCompany: v.contactsPerCompany,
    promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    senderEmail: v.senderEmail,
    senderName: v.senderName,
    replyToEmail: v.replyToEmail,
    signatureText: v.signatureText ?? null,
    icp: icp ?? null,
  });

  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
  redirect("/campaigns");
}

export async function updateCampaign(
  _prev: CreateCampaignState,
  formData: FormData,
): Promise<CreateCampaignState> {
  const check = await checkAdmin();
  if (!check.ok) return { ok: false, error: "forbidden" };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { ok: false, error: "missing_id" };

  const parsed = parseBase(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  const icp = icpFromForm(formData);

  await db
    .update(schema.campaigns)
    .set({
      name: v.name,
      vertical: v.vertical as Vertical,
      heroSkuId: v.heroSkuId || heroSkuByVertical[v.vertical as Vertical],
      status: v.status as (typeof STATUSES)[number],
      dailyCap: v.dailyCap,
      contactsPerCompany: v.contactsPerCompany,
      senderEmail: v.senderEmail,
      senderName: v.senderName,
      replyToEmail: v.replyToEmail,
      icp: icp ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.campaigns.id, id));

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}/edit`);
  revalidatePath("/dashboard");
  redirect("/campaigns");
}

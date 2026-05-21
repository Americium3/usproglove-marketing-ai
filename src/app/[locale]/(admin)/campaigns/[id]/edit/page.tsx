import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { parseIcp } from "@/lib/workflow/icp";
import { CampaignForm } from "../../new/CampaignForm";
import type { Vertical } from "@/../content/catalog/products";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("campaigns");

  const rows = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, id))
    .limit(1);
  if (rows.length === 0) notFound();
  const c = rows[0];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/campaigns" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          ← {t("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("editTitle")}</h1>
      </div>

      <CampaignForm
        mode="edit"
        defaults={{
          id: c.id,
          name: c.name,
          vertical: c.vertical as Vertical,
          heroSkuId: c.heroSkuId,
          status: c.status as "draft" | "active" | "paused" | "archived",
          dailyCap: c.dailyCap,
          contactsPerCompany: c.contactsPerCompany,
          senderEmail: c.senderEmail,
          senderName: c.senderName,
          replyToEmail: c.replyToEmail,
          signatureText: c.signatureText ?? "",
          icp: parseIcp(c.icp),
        }}
      />
    </div>
  );
}

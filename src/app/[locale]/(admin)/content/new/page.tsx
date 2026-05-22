import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CONTENT_VERTICALS } from "@/lib/content/verticals";
import ManualPieceForm from "../_components/ManualPieceForm";

export default async function NewContentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/content" className="text-xs text-neutral-500 hover:underline">← {t("backToList")}</Link>
        <h1 className="text-2xl font-semibold mt-2">{t("new.heading")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1 max-w-2xl">{t("new.description")}</p>
      </div>
      <ManualPieceForm verticals={CONTENT_VERTICALS as unknown as string[]} />
    </div>
  );
}

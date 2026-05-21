import { setRequestLocale, getTranslations } from "next-intl/server";

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("knowledge");

  const moduleKeys = ["documents", "personas", "responses", "retrieval", "training"] as const;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <span className="text-xs uppercase tracking-wide px-2 py-1 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("phase")}
        </span>
      </div>
      <p className="text-neutral-600 dark:text-neutral-400 mb-10 max-w-2xl">{t("description")}</p>

      <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
        <div className="text-xs uppercase tracking-wide text-neutral-500 mb-4">{t("plannedModules")}</div>
        <ul className="space-y-3">
          {moduleKeys.map((key) => (
            <li key={key} className="flex items-start gap-3 text-sm">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-neutral-400" />
              <span>{t(`modules.${key}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

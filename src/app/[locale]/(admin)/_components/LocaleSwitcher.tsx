"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABEL: Record<(typeof routing.locales)[number], string> = {
  en: "EN",
  zh: "简",
  "zh-TW": "繁",
};

export function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const active = useLocale();

  return (
    <div className="inline-flex rounded border border-neutral-200 dark:border-neutral-800 text-xs overflow-hidden">
      {routing.locales.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => router.replace(pathname, { locale })}
            aria-current={isActive ? "true" : undefined}
            className={
              isActive
                ? "px-2 py-1 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            }
          >
            {LABEL[locale]}
          </button>
        );
      })}
    </div>
  );
}

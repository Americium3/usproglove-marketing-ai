"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateBackgroundAction } from "../actions";

export function BackgroundEditor({
  companyId,
  initial,
}: {
  companyId: string;
  initial: string | null;
}) {
  const t = useTranslations("crm.background");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    start(async () => {
      const res = await updateBackgroundAction({ companyId, background: value });
      if (!res.ok) setError(res.error);
      else setEditing(false);
    });
  };

  if (!editing) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {initial ? t("edit") : t("add")}
          </button>
        </div>
        {initial ? (
          <p className="whitespace-pre-wrap rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 text-sm">
            {initial}
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-center text-sm text-neutral-500">
            {t("empty")}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder={t("placeholder")}
        className="w-full resize-y rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
        disabled={pending}
      />
      <div className="flex items-center justify-end gap-2">
        {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
        <button
          type="button"
          onClick={() => {
            setValue(initial ?? "");
            setEditing(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </section>
  );
}

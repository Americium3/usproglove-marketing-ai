"use client";

import { useTransition, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createKnowledgeSource, createKnowledgeSourceFromUrl } from "../actions";

interface Props {
  verticals: readonly string[];
  kinds: readonly string[];
}

type Mode = "text" | "url";

export default function KnowledgeForm({ verticals, kinds }: Props) {
  const t = useTranslations("knowledge.form");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("text");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOkMessage(null);
    const fd = new FormData(e.currentTarget);
    const action = mode === "url" ? createKnowledgeSourceFromUrl : createKnowledgeSource;
    startTransition(async () => {
      const res = await action(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        setOkMessage(t("created", { count: res.chunkCount }));
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4 bg-white dark:bg-neutral-950"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <div
          role="tablist"
          className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 p-0.5 text-xs"
        >
          {(["text", "url"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded ${
                mode === m
                  ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              }`}
            >
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
      </div>

      {mode === "text" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.title")}</span>
            <input
              name="title"
              required
              minLength={2}
              maxLength={200}
              placeholder={t("placeholders.title")}
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.kind")}</span>
            <select
              name="kind"
              defaultValue="text"
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.vertical")}</span>
            <select
              name="vertical"
              defaultValue=""
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            >
              <option value="">{t("fields.verticalAny")}</option>
              {verticals.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.category")}</span>
            <input
              name="category"
              maxLength={64}
              placeholder={t("placeholders.category")}
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
            <span className="text-xs text-neutral-500">{t("fields.categoryHint")}</span>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.sourceUrl")}</span>
            <input
              type="url"
              name="sourceUrl"
              placeholder="https://..."
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.content")}</span>
            <textarea
              name="rawContent"
              required
              minLength={20}
              maxLength={200_000}
              rows={10}
              placeholder={t("placeholders.content")}
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm font-mono"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.url")}</span>
            <input
              type="url"
              name="url"
              required
              placeholder="https://example.com/product-spec"
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
            <span className="text-xs text-neutral-500">{t("fields.urlHint")}</span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.titleOverride")}</span>
            <input
              name="titleOverride"
              maxLength={200}
              placeholder={t("placeholders.titleOverride")}
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.vertical")}</span>
            <select
              name="vertical"
              defaultValue=""
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            >
              <option value="">{t("fields.verticalAny")}</option>
              {verticals.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-700 dark:text-neutral-300">{t("fields.category")}</span>
            <input
              name="category"
              maxLength={64}
              placeholder={t("placeholders.category")}
              className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
            <span className="text-xs text-neutral-500">{t("fields.categoryHint")}</span>
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? t("submitting") : t("submit")}
        </button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        {okMessage && <span className="text-sm text-green-600 dark:text-green-400">{okMessage}</span>}
      </div>
    </form>
  );
}

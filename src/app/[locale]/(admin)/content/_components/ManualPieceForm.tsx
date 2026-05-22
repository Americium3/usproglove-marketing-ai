"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { actionCreateManualPiece } from "../actions";

export default function ManualPieceForm({ verticals }: { verticals: string[] }) {
  const t = useTranslations("content.new");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await actionCreateManualPiece(fd);
      if (!r.ok) setError(r.error);
      else router.push(`/content/${r.pieceId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 bg-white dark:bg-neutral-950">
      <div className="grid sm:grid-cols-[160px_1fr_120px] gap-3">
        <select name="vertical" className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm" defaultValue={verticals[0]}>
          {verticals.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input name="title" required placeholder={t("title")} className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm" />
        <select name="locale" defaultValue="en" className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm">
          <option value="en">en</option>
          <option value="zh">zh</option>
          <option value="zh-TW">zh-TW</option>
        </select>
      </div>
      <input name="heroSkuId" placeholder={t("heroSkuId")} className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm" />
      <input name="keywords" placeholder={t("keywords")} className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm" />
      <textarea name="excerpt" rows={2} placeholder={t("excerpt")} className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm" />
      <textarea name="bodyMdx" required rows={18} placeholder={t("body")} className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm font-mono" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm disabled:opacity-50">
          {pending ? t("creating") : t("create")}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { actionGenerateBrief, actionDraftFromBrief, actionDeleteCluster } from "../actions";

interface ClusterDTO {
  id: string;
  name: string;
  vertical: string;
  seedTerm: string;
  intent: string;
  termCount: number;
  briefCount: number;
}

export default function ClusterRow({ cluster, createdLabel }: { cluster: ClusterDTO; createdLabel: string }) {
  const t = useTranslations("content.clusters");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState("en");

  function generateBrief() {
    const fd = new FormData();
    fd.set("clusterId", cluster.id);
    fd.set("locale", locale);
    startTransition(async () => {
      setError(null);
      const r = await actionGenerateBrief(fd);
      if (!r.ok) { setError(r.error); return; }
      const draft = await actionDraftFromBrief(r.briefId);
      if (!draft.ok) { setError(draft.error); return; }
      router.push(`/content/${draft.pieceId}`);
    });
  }

  function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const r = await actionDeleteCluster(cluster.id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <tr className="border-t border-neutral-200 dark:border-neutral-800 align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{cluster.name}</div>
        <div className="text-xs text-neutral-500">seed: {cluster.seedTerm}</div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </td>
      <td className="px-3 py-2 text-xs">{cluster.vertical}</td>
      <td className="px-3 py-2 text-xs">{cluster.intent}</td>
      <td className="px-3 py-2 text-right tabular-nums">{cluster.termCount}</td>
      <td className="px-3 py-2 text-right tabular-nums">{cluster.briefCount}</td>
      <td className="px-3 py-2 text-xs text-neutral-500">{createdLabel}</td>
      <td className="px-3 py-2 text-right space-x-1">
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-1.5 py-1 text-xs"
        >
          <option value="en">en</option>
          <option value="zh">zh</option>
          <option value="zh-TW">zh-TW</option>
        </select>
        <button
          type="button"
          onClick={generateBrief}
          disabled={pending}
          className="rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-2 py-1 text-xs disabled:opacity-50"
        >
          {pending ? t("running") : t("draftButton")}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          {t("delete")}
        </button>
      </td>
    </tr>
  );
}

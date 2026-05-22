"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { actionGenerateClusters, actionSaveClusters } from "../actions";
import type { GeneratedCluster } from "@/lib/content/clusters";

interface Props {
  verticals: string[];
}

export default function ClusterGenerator({ verticals }: Props) {
  const t = useTranslations("content.cluster");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{
    clusters: GeneratedCluster[];
    vertical: string;
    seedTerm: string;
  } | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  function togglePick(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function onGenerate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setGenerated(null);
    setPicked(new Set());
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await actionGenerateClusters(fd);
      if (!r.ok) setError(r.error);
      else {
        setGenerated({ clusters: r.clusters, vertical: r.vertical, seedTerm: r.seedTerm });
        setPicked(new Set(r.clusters.map((_, i) => i)));
      }
    });
  }

  function onSave() {
    if (!generated) return;
    setError(null);
    const chosen = generated.clusters.filter((_, i) => picked.has(i));
    if (chosen.length === 0) return;
    startTransition(async () => {
      const r = await actionSaveClusters({
        vertical: generated.vertical,
        seedTerm: generated.seedTerm,
        clusters: chosen,
      });
      if (!r.ok) setError(r.error);
      else {
        setGenerated(null);
        setPicked(new Set());
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 bg-white dark:bg-neutral-950 space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-xs text-neutral-500 mt-1">{t("hint")}</p>
      </div>
      <form onSubmit={onGenerate} className="grid sm:grid-cols-[160px_1fr_120px_auto] gap-2">
        <select name="vertical" className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm" defaultValue={verticals[0]}>
          {verticals.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input
          name="seedTerm"
          required
          placeholder={t("seedPlaceholder")}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
        />
        <input
          name="count"
          type="number"
          min={1}
          max={6}
          defaultValue={3}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {pending ? t("generating") : t("generate")}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {generated && (
        <div className="space-y-3">
          <div className="text-xs text-neutral-500">{t("preview", { count: generated.clusters.length })}</div>
          <div className="space-y-2">
            {generated.clusters.map((c, i) => (
              <label key={i} className="flex gap-3 rounded border border-neutral-200 dark:border-neutral-800 p-3 cursor-pointer">
                <input type="checkbox" checked={picked.has(i)} onChange={() => togglePick(i)} className="mt-1" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-neutral-500 mb-1">intent: {c.intent}</div>
                  <div className="flex flex-wrap gap-1">
                    {c.terms.slice(0, 12).map((t, j) => (
                      <span key={j} className="text-[11px] rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5">{t.term}</span>
                    ))}
                    {c.terms.length > 12 && (
                      <span className="text-[11px] text-neutral-500">+{c.terms.length - 12}</span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={pending || picked.size === 0}
              className="rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t("saveChosen", { count: picked.size })}
            </button>
            <button
              type="button"
              onClick={() => { setGenerated(null); setPicked(new Set()); }}
              className="rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm"
            >
              {t("discard")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

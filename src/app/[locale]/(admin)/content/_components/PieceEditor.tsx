"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  actionSavePiece,
  actionRegenSection,
  actionRegenSeo,
  actionWeaveLinks,
  actionPublishNow,
  actionSchedule,
  actionUnpublish,
  actionDeletePiece,
} from "../actions";

interface PieceDTO {
  id: string;
  title: string;
  excerpt: string | null;
  bodyMdx: string;
  heroSkuId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string[];
  status: string;
  scheduledAt: string | null;
  wordCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  canonicalUrl: string | null;
}

export default function PieceEditor({ piece }: { piece: PieceDTO }) {
  const t = useTranslations("content.editor");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [title, setTitle] = useState(piece.title);
  const [excerpt, setExcerpt] = useState(piece.excerpt ?? "");
  const [body, setBody] = useState(piece.bodyMdx);
  const [seoTitle, setSeoTitle] = useState(piece.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(piece.seoDescription ?? "");
  const [keywords, setKeywords] = useState(piece.keywords.join(", "));
  const [heroSkuId, setHeroSkuId] = useState(piece.heroSkuId ?? "");
  const [scheduledAt, setScheduledAt] = useState(piece.scheduledAt ? piece.scheduledAt.slice(0, 16) : "");
  const [regenHeading, setRegenHeading] = useState("");
  const [regenInstruction, setRegenInstruction] = useState("");

  function wrap(promise: Promise<{ ok: boolean; error?: string }>, successMsg?: string) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await promise;
      if (!r.ok) setError(r.error ?? "error");
      else {
        if (successMsg) setInfo(successMsg);
        router.refresh();
      }
    });
  }

  function save() {
    const fd = new FormData();
    fd.set("pieceId", piece.id);
    fd.set("title", title);
    fd.set("excerpt", excerpt);
    fd.set("bodyMdx", body);
    fd.set("heroSkuId", heroSkuId);
    fd.set("seoTitle", seoTitle);
    fd.set("seoDescription", seoDescription);
    fd.set("keywords", keywords);
    wrap(actionSavePiece(fd), t("savedToast"));
  }

  function regenSection() {
    if (!regenHeading.trim()) return;
    const fd = new FormData();
    fd.set("pieceId", piece.id);
    fd.set("heading", regenHeading);
    if (regenInstruction.trim()) fd.set("instruction", regenInstruction);
    wrap(actionRegenSection(fd), t("regenToast"));
  }

  function schedule() {
    if (!scheduledAt) return;
    const fd = new FormData();
    fd.set("pieceId", piece.id);
    fd.set("scheduledAt", new Date(scheduledAt).toISOString());
    wrap(actionSchedule(fd), t("scheduledToast"));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-xs">
        <Stat label={t("stats.words")} value={piece.wordCount} />
        <Stat label={t("stats.internalLinks")} value={piece.internalLinkCount} />
        <Stat label={t("stats.externalLinks")} value={piece.externalLinkCount} />
      </div>

      {error && <div className="rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200 p-3">{error}</div>}
      {info && <div className="rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-800 dark:text-emerald-200 p-3">{info}</div>}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <Field label={t("title")} value={title} onChange={setTitle} />
          <Field label={t("excerpt")} value={excerpt} onChange={setExcerpt} multiline rows={3} />
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t("body")}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={28}
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm font-mono"
              spellCheck={false}
            />
          </div>
          <div className="rounded border border-dashed border-neutral-300 dark:border-neutral-700 p-4 space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t("regenSection.title")}</div>
            <input
              value={regenHeading}
              onChange={(e) => setRegenHeading(e.target.value)}
              placeholder={t("regenSection.headingPlaceholder")}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
            />
            <input
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              placeholder={t("regenSection.instructionPlaceholder")}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={regenSection}
              disabled={pending || !regenHeading.trim()}
              className="rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t("regenSection.button")}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <Sidebar title={t("sidebar.meta")}>
            <Field label={t("heroSkuId")} value={heroSkuId} onChange={setHeroSkuId} />
            <Field label={t("keywords")} value={keywords} onChange={setKeywords} placeholder="nitrile gloves, tattoo gloves" />
          </Sidebar>

          <Sidebar title={t("sidebar.seo")}>
            <Field label={t("seoTitle")} value={seoTitle} onChange={setSeoTitle} />
            <Field label={t("seoDescription")} value={seoDescription} onChange={setSeoDescription} multiline rows={3} />
            <button
              type="button"
              onClick={() => wrap(actionRegenSeo(piece.id), t("seoToast"))}
              disabled={pending}
              className="rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {t("regenSeo")}
            </button>
            {piece.canonicalUrl && (
              <div className="text-[11px] text-neutral-500 truncate">{piece.canonicalUrl}</div>
            )}
          </Sidebar>

          <Sidebar title={t("sidebar.links")}>
            <button
              type="button"
              onClick={() => wrap(actionWeaveLinks(piece.id), t("weaveToast"))}
              disabled={pending}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {t("weaveButton")}
            </button>
          </Sidebar>

          <Sidebar title={t("sidebar.publish")}>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={schedule}
              disabled={pending || !scheduledAt}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {t("scheduleButton")}
            </button>
            <button
              type="button"
              onClick={() => wrap(actionPublishNow(piece.id), t("publishToast"))}
              disabled={pending}
              className="w-full rounded bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {t("publishNow")}
            </button>
            {piece.status === "published" && (
              <button
                type="button"
                onClick={() => wrap(actionUnpublish(piece.id), t("unpublishToast"))}
                disabled={pending}
                className="w-full rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {t("unpublish")}
              </button>
            )}
          </Sidebar>

          <Sidebar title={t("sidebar.danger")}>
            <button
              type="button"
              onClick={() => {
                if (!confirm(t("deleteConfirm"))) return;
                startTransition(async () => {
                  const r = await actionDeletePiece(piece.id);
                  if (!r.ok) setError(r.error);
                  else router.push("/content");
                });
              }}
              disabled={pending}
              className="w-full rounded border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {t("delete")}
            </button>
          </Sidebar>
        </aside>
      </div>

      <div className="sticky bottom-2 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm shadow disabled:opacity-50"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}

function Sidebar({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 space-y-2 bg-white dark:bg-neutral-950">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1">
      <span className="text-neutral-500">{label}: </span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  rows = 2,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
        />
      )}
    </div>
  );
}

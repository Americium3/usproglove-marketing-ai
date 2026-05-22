"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { reingestKnowledgeSource } from "../actions";

interface Props {
  sourceId: string;
  sourceKind: string;
  hasSourceUrl: boolean;
}

export default function ReingestButton({ sourceId, sourceKind, hasSourceUrl }: Props) {
  const t = useTranslations("knowledge.detail");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const isUrl = sourceKind === "url";
  const blockedUrlReingest = isUrl && !hasSourceUrl;

  function onClick() {
    if (blockedUrlReingest) return;
    const label = isUrl ? t("confirmReingestUrl") : t("confirmReingestStored");
    if (!confirm(label)) return;

    setStatus(null);
    startTransition(async () => {
      const res = await reingestKnowledgeSource(sourceId);
      if (!res.ok) {
        setStatus(`${t("reingestFailed")}: ${res.error}`);
        return;
      }
      setStatus(t("reingestOk", { count: res.chunkCount }));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || blockedUrlReingest}
        className="text-xs rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-50"
        title={blockedUrlReingest ? t("missingSourceUrl") : undefined}
      >
        {pending ? t("reingesting") : isUrl ? t("reingestUrl") : t("reingestStored")}
      </button>
      {status && <span className="text-xs text-neutral-600 dark:text-neutral-400">{status}</span>}
    </div>
  );
}

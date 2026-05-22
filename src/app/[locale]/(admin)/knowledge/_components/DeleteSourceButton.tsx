"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteKnowledgeSource } from "../actions";

export default function DeleteSourceButton({ sourceId, title }: { sourceId: string; title: string }) {
  const t = useTranslations("knowledge.list");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!confirm(t("confirmDelete", { title }))) return;
    startTransition(async () => {
      const res = await deleteKnowledgeSource(sourceId);
      if (!res.ok) {
        alert(`${t("deleteFailed")}: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
    >
      {pending ? t("deleting") : t("delete")}
    </button>
  );
}

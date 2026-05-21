"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { addNoteAction, deleteNoteAction } from "../actions";

export interface NoteRow {
  id: string;
  body: string;
  authorEmail: string;
  createdAt: Date;
  prospectId: string | null;
  prospectLabel?: string | null;
}

export function NotesPanel({
  companyId,
  prospectId,
  notes,
  scopeLabel,
}: {
  companyId: string;
  prospectId?: string | null;
  notes: NoteRow[];
  scopeLabel?: string;
}) {
  const t = useTranslations("crm.notes");
  const format = useFormatter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!body.trim()) return;
    setError(null);
    start(async () => {
      const res = await addNoteAction({ companyId, prospectId: prospectId ?? null, body });
      if (!res.ok) setError(res.error);
      else setBody("");
    });
  };

  const remove = (id: string) => {
    start(async () => {
      await deleteNoteAction({ id, companyId, prospectId: prospectId ?? null });
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {scopeLabel && <span className="text-xs text-neutral-500">{scopeLabel}</span>}
      </div>

      <div className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("placeholder")}
          rows={3}
          className="w-full resize-none rounded border border-neutral-200 dark:border-neutral-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-2">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            type="button"
            onClick={submit}
            disabled={pending || !body.trim()}
            className="ml-auto rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {pending ? t("saving") : t("add")}
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs text-neutral-500">
                  {format.dateTime(n.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  {" · "}
                  {n.authorEmail}
                  {n.prospectLabel && (
                    <>
                      {" · "}
                      <span className="text-neutral-400">{n.prospectLabel}</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="text-xs text-neutral-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                  disabled={pending}
                >
                  {t("delete")}
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

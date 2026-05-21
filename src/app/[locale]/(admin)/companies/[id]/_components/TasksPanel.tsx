"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { addTaskAction, updateTaskStatusAction, deleteTaskAction } from "../actions";

export type TaskStatus = "open" | "done" | "snoozed" | "cancelled";

export interface TaskRow {
  id: string;
  title: string;
  body: string | null;
  status: TaskStatus;
  dueAt: Date | null;
  createdAt: Date;
  createdByEmail: string;
  prospectId: string | null;
  prospectLabel?: string | null;
}

export function TasksPanel({
  companyId,
  prospectId,
  tasks,
  scopeLabel,
}: {
  companyId: string;
  prospectId?: string | null;
  tasks: TaskRow[];
  scopeLabel?: string;
}) {
  const t = useTranslations("crm.tasks");
  const format = useFormatter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, start] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!title.trim()) return;
    setError(null);
    start(async () => {
      const res = await addTaskAction({
        companyId,
        prospectId: prospectId ?? null,
        title,
        body: body.trim() || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      if (!res.ok) setError(res.error);
      else {
        setTitle("");
        setBody("");
        setDueAt("");
        setShowForm(false);
      }
    });
  };

  const setStatus = (id: string, status: TaskStatus) => {
    start(async () => {
      await updateTaskStatusAction({ id, status, companyId, prospectId: prospectId ?? null });
    });
  };

  const remove = (id: string) => {
    start(async () => {
      await deleteTaskAction({ id, companyId, prospectId: prospectId ?? null });
    });
  };

  const open = tasks.filter((t) => t.status === "open");
  const closed = tasks.filter((t) => t.status !== "open");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <div className="flex items-center gap-3">
          {scopeLabel && <span className="text-xs text-neutral-500">{scopeLabel}</span>}
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded border border-neutral-300 dark:border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            {showForm ? t("cancel") : t("new")}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            className="w-full rounded border border-neutral-200 dark:border-neutral-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
            disabled={pending}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("bodyPlaceholder")}
            rows={2}
            className="w-full resize-none rounded border border-neutral-200 dark:border-neutral-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
            disabled={pending}
          />
          <div className="flex items-center justify-between gap-2">
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="rounded border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-400"
              disabled={pending}
            />
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button
              type="button"
              onClick={submit}
              disabled={pending || !title.trim()}
              className="ml-auto rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              {pending ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {open.length > 0 && (
            <ul className="space-y-1.5">
              {open.map((task) => (
                <TaskItem key={task.id} task={task} pending={pending} onStatus={setStatus} onDelete={remove} format={format} t={t} />
              ))}
            </ul>
          )}
          {closed.length > 0 && (
            <details className="space-y-1.5">
              <summary className="cursor-pointer text-xs text-neutral-500">
                {t("doneCount", { n: closed.length })}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {closed.map((task) => (
                  <TaskItem key={task.id} task={task} pending={pending} onStatus={setStatus} onDelete={remove} format={format} t={t} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

type TFn = ReturnType<typeof useTranslations<"crm.tasks">>;

function TaskItem({
  task,
  pending,
  onStatus,
  onDelete,
  format,
  t,
}: {
  task: TaskRow;
  pending: boolean;
  onStatus: (id: string, s: TaskStatus) => void;
  onDelete: (id: string) => void;
  format: ReturnType<typeof useFormatter>;
  t: TFn;
}) {
  const overdue = task.status === "open" && task.dueAt && task.dueAt.getTime() < Date.now();
  const isDone = task.status === "done";
  return (
    <li className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 group">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => onStatus(task.id, e.target.checked ? "done" : "open")}
          disabled={pending}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium ${isDone ? "line-through text-neutral-400" : ""}`}>
            {task.title}
          </div>
          {task.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">{task.body}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            {task.dueAt && (
              <span className={overdue ? "text-red-600" : ""}>
                {t("due")}: {format.dateTime(task.dueAt, { dateStyle: "short", timeStyle: "short" })}
              </span>
            )}
            {task.prospectLabel && <span className="text-neutral-400">· {task.prospectLabel}</span>}
            <span className="text-neutral-400">· {task.createdByEmail}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="text-xs text-neutral-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
          disabled={pending}
        >
          {t("delete")}
        </button>
      </div>
    </li>
  );
}

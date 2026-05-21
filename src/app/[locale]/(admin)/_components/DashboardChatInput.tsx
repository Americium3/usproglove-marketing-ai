"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { sendAssistantMessage } from "@/lib/assistant/chat";

export function DashboardChatInput() {
  const t = useTranslations("assistant");
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [response, setResponse] = useState<{
    message: string;
    citations: Array<{ title: string; link: string; snippet: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const message = input.trim();
    if (!message || pending) return;
    setError(null);
    setResponse(null);
    startTransition(async () => {
      const res = await sendAssistantMessage({ history: [], userMessage: message });
      if (res.ok) {
        setResponse({ message: res.message, citations: res.citations });
        setInput("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold">{t("dashboardTitle")}</h2>
        <span className="text-xs text-neutral-500">{t("dashboardSubtitle")}</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("dashboardPlaceholder")}
          rows={2}
          disabled={pending}
          className="flex-1 resize-none text-sm bg-transparent border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-200"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending ? t("thinking") : t("send")}
        </button>
      </form>

      {error && (
        <div className="mt-3 text-sm text-red-600 dark:text-red-400">
          {t("error")}: {error}
        </div>
      )}

      {response && (
        <div className="mt-4 space-y-3">
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{response.message}</div>
          {response.citations.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-neutral-500 font-medium">{t("sources")}</div>
              {response.citations.map((c, i) => (
                <a
                  key={i}
                  href={c.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded border border-neutral-200 dark:border-neutral-800 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900 text-sm"
                >
                  <div className="font-medium line-clamp-1">{c.title}</div>
                  <div className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{c.snippet}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { sendAssistantMessage, type ChatMessage, type Citation } from "@/lib/assistant/chat";

interface TurnMessage extends ChatMessage {
  citations?: Citation[];
}

function CitationList({
  citations,
  t,
}: {
  citations: Citation[];
  t: ReturnType<typeof useTranslations>;
}) {
  const knowledge = citations.filter((c) => c.kind === "knowledge");
  const web = citations.filter((c) => c.kind === "web");

  return (
    <div className="mt-2 space-y-2 text-xs">
      {knowledge.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-neutral-500 font-medium">{t("sourcesKnowledge")}</div>
          {knowledge.map((c, j) => (
            <Link
              key={`k-${j}`}
              href={c.link}
              className="block rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-neutral-900 dark:text-neutral-100 line-clamp-1 flex-1">{c.title}</div>
                {typeof c.similarity === "number" && (
                  <span className="text-[10px] tabular-nums text-neutral-400">
                    {Math.round(c.similarity * 100)}%
                  </span>
                )}
              </div>
              {(c.vertical || c.category) && (
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">
                  {[c.vertical, c.category].filter(Boolean).join(" · ")}
                </div>
              )}
              <div className="text-neutral-500 line-clamp-2 mt-0.5">{c.snippet}</div>
            </Link>
          ))}
        </div>
      )}
      {web.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-neutral-500 font-medium">{t("sourcesWeb")}</div>
          {web.map((c, j) => (
            <a
              key={`w-${j}`}
              href={c.link}
              target="_blank"
              rel="noreferrer noopener"
              className="block rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <div className="text-neutral-900 dark:text-neutral-100 line-clamp-1">{c.title}</div>
              <div className="text-neutral-500 line-clamp-2">{c.snippet}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssistantWidget({ initialOpen = false }: { initialOpen?: boolean }) {
  const t = useTranslations("assistant");
  const [open, setOpen] = useState(initialOpen);
  const [messages, setMessages] = useState<TurnMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  function submit() {
    const userMessage = input.trim();
    if (!userMessage || pending) return;
    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    startTransition(async () => {
      const res = await sendAssistantMessage({ history, userMessage });
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.message, citations: res.citations },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠ ${t("error")}: ${res.error}` },
        ]);
      }
    });
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 h-12 px-5 text-sm font-medium shadow-lg hover:opacity-90 flex items-center gap-2"
          aria-label={t("open")}
        >
          <span>✨</span>
          <span>{t("triggerLabel")}</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-40 w-[min(420px,calc(100vw-2rem))] h-[min(600px,calc(100vh-5rem))] rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl flex flex-col overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <div className="text-sm font-medium">{t("title")}</div>
              <div className="text-xs text-neutral-500">{t("subtitle")}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 text-lg leading-none"
              aria-label={t("close")}
            >
              ×
            </button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-neutral-500 text-center py-8 space-y-3">
                <p>{t("emptyPrompt")}</p>
                <ul className="text-xs space-y-1 text-left inline-block">
                  <li>· {t("suggestion1")}</li>
                  <li>· {t("suggestion2")}</li>
                  <li>· {t("suggestion3")}</li>
                </ul>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "text-sm ml-8 rounded-lg bg-neutral-100 dark:bg-neutral-900 px-3 py-2 whitespace-pre-wrap"
                    : "text-sm mr-4 whitespace-pre-wrap"
                }
              >
                {m.content}
                {m.citations && m.citations.length > 0 && (
                  <CitationList citations={m.citations} t={t} />
                )}
              </div>
            ))}
            {pending && (
              <div className="text-sm text-neutral-500 italic">{t("thinking")}</div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="border-t border-neutral-200 dark:border-neutral-800 p-3 flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t("inputPlaceholder")}
              rows={2}
              disabled={pending}
              className="flex-1 resize-none text-sm bg-transparent border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-200"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-2 text-sm disabled:opacity-50"
            >
              {t("send")}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

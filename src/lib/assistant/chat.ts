"use server";

import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { gateway } from "@ai-sdk/gateway";
import { checkAdmin } from "@/lib/auth/admin";
import { webSearch } from "@/lib/search/serper";
import { db, schema } from "@/lib/db";
import { estimateCostUsd } from "@/lib/ai/pricing";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  ok: true;
  message: string;
  citations: Array<{ title: string; link: string; snippet: string }>;
}

export type AssistantResult =
  | ChatResponse
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are the USProGlove Marketing Agent's built-in assistant.

You help the admin operator: explain features, suggest ICP copy, draft messaging, analyze usage metrics, and research prospects or competitors via web search.

Context:
- The product is a disposable nitrile glove brand (USProGlove / Ultra Stretch Professional).
- Verticals include tattoo, beauty/nail/salon, restaurant, medical clinic, industrial, automotive, agriculture, janitorial, cannabis, veterinary.
- The outbound pipeline: Google Places → Hunter/Snov enrichment → AI fit score → AI draft → Brevo send.

Rules:
- Respond in the user's language (Chinese if they ask in Chinese, English otherwise).
- When the user asks about current events, companies, competitors, industry stats, or anything time-sensitive, call the web_search tool.
- Keep answers tight. Use bullets or short paragraphs, not walls of text.
- Never invent facts about real businesses, products, prices, or people. If unsure, say so or search.
- If the user asks about platform features or internal data, answer from general knowledge of the system architecture — you cannot query the DB directly.
- Do not mention internal vendor names (Hunter, Snov, Brevo, Apollo, Serper) in user-facing answers. Refer to them by role: "email enrichment", "email delivery", "web search".`;

export async function sendAssistantMessage(args: {
  history: ChatMessage[];
  userMessage: string;
}): Promise<AssistantResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };

  const userMessage = args.userMessage.trim();
  if (userMessage.length === 0) return { ok: false, error: "empty_message" };
  if (userMessage.length > 4000) return { ok: false, error: "too_long" };

  const citations: Array<{ title: string; link: string; snippet: string }> = [];
  const modelId = "anthropic/claude-sonnet-4-6";
  const start = Date.now();

  try {
    const result = await generateText({
      model: gateway(modelId),
      system: SYSTEM_PROMPT,
      messages: [
        ...args.history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userMessage },
      ],
      tools: {
        web_search: tool({
          description:
            "Search the public web for current information. Use for competitor research, industry stats, recent news, or anything time-sensitive. Returns up to 8 results.",
          inputSchema: z.object({
            query: z.string().min(2).max(200).describe("the search query"),
          }),
          execute: async ({ query }) => {
            const res = await webSearch(query, { num: 8 });
            for (const r of res.results.slice(0, 5)) {
              citations.push({ title: r.title, link: r.link, snippet: r.snippet });
            }
            return {
              answer: res.answer,
              results: res.results.slice(0, 8).map((r) => ({
                title: r.title,
                link: r.link,
                snippet: r.snippet,
              })),
            };
          },
        }),
      },
      stopWhen: stepCountIs(5),
    });

    const durationMs = Date.now() - start;
    const usage = {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      reasoningTokens: result.usage?.reasoningTokens ?? 0,
      cachedTokens: result.usage?.cachedInputTokens ?? 0,
    };
    const costUsd = estimateCostUsd(modelId, usage);

    try {
      await db.insert(schema.aiUsage).values({
        task: "research",
        modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        cachedTokens: usage.cachedTokens,
        costUsd: String(costUsd),
        durationMs,
        errored: false,
        metadata: {
          surface: "assistant_widget",
          operator: auth.email,
          citationCount: citations.length,
        },
      });
    } catch {
    }

    return { ok: true, message: result.text, citations };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

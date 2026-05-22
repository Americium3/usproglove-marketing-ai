"use server";

import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { gateway } from "@ai-sdk/gateway";
import { checkAdmin } from "@/lib/auth/admin";
import { webSearch } from "@/lib/search/serper";
import { db, schema } from "@/lib/db";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { retrieveChunks } from "@/lib/knowledge/retrieve";

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
- When asked about USProGlove's products, certifications, buyer personas, objection handling, FAQ language, or any curated internal knowledge, call knowledge_search FIRST. Prefer internal knowledge over guessing.
- For current events, companies, competitors, industry stats, or anything time-sensitive, call web_search.
- Keep answers tight. Use bullets or short paragraphs, not walls of text.
- Never invent facts about real businesses, products, prices, or people. If unsure, say so or search.
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
        knowledge_search: tool({
          description:
            "Semantic search over the internal USProGlove knowledge base (product specs, buyer personas, FAQ language, compliance notes, objection responses, curated company knowledge). Use BEFORE web_search whenever the question is about USProGlove itself, its products, or how to talk to its target verticals. Optional vertical filter narrows results to one industry (tattoo, beauty, restaurant, medical, industrial, automotive, agriculture, janitorial, cannabis, veterinary, supplier).",
          inputSchema: z.object({
            query: z.string().min(2).max(400).describe("the question or topic to retrieve"),
            vertical: z
              .enum(schema.verticalEnum.enumValues)
              .optional()
              .describe("restrict to a single industry vertical"),
            k: z.number().int().min(1).max(10).optional().describe("how many chunks to return (default 5)"),
          }),
          execute: async ({ query, vertical, k }) => {
            try {
              const chunks = await retrieveChunks(query, { vertical, k: k ?? 5 });
              for (const c of chunks.slice(0, 5)) {
                citations.push({
                  title: c.sourceTitle,
                  link: `/knowledge#${c.sourceId}`,
                  snippet: c.text.slice(0, 240),
                });
              }
              return {
                matched: chunks.length,
                chunks: chunks.map((c) => ({
                  title: c.sourceTitle,
                  vertical: c.vertical,
                  category: c.category,
                  text: c.text,
                  similarity: Number(c.similarity.toFixed(3)),
                })),
              };
            } catch (err) {
              return { matched: 0, chunks: [], error: (err as Error).message };
            }
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

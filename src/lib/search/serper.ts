export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  position?: number;
}

export interface WebSearchResponse {
  query: string;
  answer?: string;
  results: WebSearchResult[];
}

/**
 * Serper.dev Google search wrapper. Vendor id hidden from UI per project rule —
 * downstream consumers see "web search", not "Serper".
 */
export async function webSearch(query: string, opts?: { num?: number }): Promise<WebSearchResponse> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY not set");

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: Math.min(opts?.num ?? 8, 15),
      autocorrect: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`web search failed ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    organic?: Array<{
      title: string;
      link: string;
      snippet: string;
      date?: string;
      position?: number;
    }>;
    answerBox?: { answer?: string; snippet?: string };
    knowledgeGraph?: { description?: string };
  };

  const answer =
    data.answerBox?.answer ??
    data.answerBox?.snippet ??
    data.knowledgeGraph?.description;

  return {
    query,
    answer,
    results: (data.organic ?? []).map((r) => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet,
      date: r.date,
      position: r.position,
    })),
  };
}

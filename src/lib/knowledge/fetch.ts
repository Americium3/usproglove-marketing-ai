const USER_AGENT =
  "Mozilla/5.0 (compatible; USProGloveBot/1.0; +https://usproglove.com)";
const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 15_000;

export interface FetchedPage {
  title: string;
  text: string;
  finalUrl: string;
}

export async function fetchUrlAsText(url: string): Promise<FetchedPage> {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("only http(s) urls are supported");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: ctrl.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);

  const ct = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(ct) && !/text\/plain/i.test(ct)) {
    throw new Error(`unsupported content-type: ${ct || "unknown"}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("no response body");
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > MAX_BYTES) {
        await reader.cancel();
        throw new Error(`page too large (> ${MAX_BYTES} bytes)`);
      }
      chunks.push(value);
    }
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() : parsed.hostname;

  const text = htmlToText(html);
  return { title: title || parsed.hostname, text, finalUrl: res.url || parsed.toString() };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:br|p|div|li|tr|h[1-6]|article|section|header|footer)[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|article|section|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => decodeEntities(line).replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n\n");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

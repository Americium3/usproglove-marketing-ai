/**
 * Tiny, dependency-free Markdown → React node renderer.
 *
 * Scope is intentionally narrow: the drafter is constrained to produce only
 * headings (#–###), paragraphs, bullet lists, **bold**, *italic*, [text](url)
 * links, and inline `code`. No HTML passthrough, no images, no nested blocks.
 * Anything outside that subset is rendered as plain text. This keeps the
 * public article surface predictable and XSS-safe (we never set innerHTML).
 */
import type { ReactNode } from "react";

interface Block {
  kind: "h1" | "h2" | "h3" | "p" | "ul";
  text?: string;
  items?: string[];
}

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];
  let inList = false;
  let listBuf: string[] = [];

  const flushParagraph = () => {
    if (buf.length === 0) return;
    blocks.push({ kind: "p", text: buf.join(" ").trim() });
    buf = [];
  };
  const flushList = () => {
    if (!inList) return;
    blocks.push({ kind: "ul", items: listBuf });
    listBuf = [];
    inList = false;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph();
      flushList();
      const level = h[1].length;
      blocks.push({ kind: (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as Block["kind"], text: h[2].trim() });
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushParagraph();
      inList = true;
      listBuf.push(li[1].trim());
      continue;
    }
    flushList();
    buf.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

interface InlineSeg {
  kind: "text" | "bold" | "italic" | "code" | "link";
  text: string;
  href?: string;
}

export function parseInline(text: string): InlineSeg[] {
  const out: InlineSeg[] = [];
  let i = 0;
  while (i < text.length) {
    // link [text](url)
    if (text[i] === "[") {
      const close = text.indexOf("](", i);
      if (close !== -1) {
        const end = text.indexOf(")", close + 2);
        if (end !== -1) {
          out.push({ kind: "link", text: text.slice(i + 1, close), href: text.slice(close + 2, end) });
          i = end + 1;
          continue;
        }
      }
    }
    // bold **x**
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        out.push({ kind: "bold", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // inline code `x`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        out.push({ kind: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // italic *x* (avoid colliding with bold — checked above)
    if (text[i] === "*" && text[i + 1] !== "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        out.push({ kind: "italic", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // accumulate plain text up to next special char
    const next = text.slice(i).search(/[\[\*`]/);
    if (next === -1) {
      out.push({ kind: "text", text: text.slice(i) });
      break;
    }
    if (next === 0) {
      out.push({ kind: "text", text: text[i] });
      i += 1;
    } else {
      out.push({ kind: "text", text: text.slice(i, i + next) });
      i += next;
    }
  }
  return out;
}

export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return parseInline(text).map((seg, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (seg.kind) {
      case "bold":
        return (<strong key={key}>{seg.text}</strong>);
      case "italic":
        return (<em key={key}>{seg.text}</em>);
      case "code":
        return (<code key={key} className="rounded bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 text-[0.92em]">{seg.text}</code>);
      case "link": {
        const href = seg.href ?? "#";
        const isExternal = /^https?:\/\//.test(href) && !href.includes("usproglove.com");
        return (
          <a
            key={key}
            href={href}
            className="underline underline-offset-2 hover:opacity-80"
            {...(isExternal ? { target: "_blank", rel: "noopener nofollow" } : {})}
          >
            {seg.text}
          </a>
        );
      }
      default:
        return seg.text;
    }
  });
}

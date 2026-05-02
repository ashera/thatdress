import "server-only";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1500;

// Server-managed tool definitions. Tool versions evolve — bump if Anthropic
// publishes a newer one and the API rejects these.
export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
} as const;

export const WEB_FETCH_TOOL = {
  type: "web_fetch_20250722",
  name: "web_fetch",
  max_uses: 3,
} as const;

export type Message = { role: "user" | "assistant"; content: string };

export type Tool = Record<string, unknown>;

export type CallOpts = {
  system: string;
  messages: Message[];
  model?: string;
  maxTokens?: number;
  tools?: Tool[];
};

export type CallResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

/** Single-turn (or short multi-turn) call to the Anthropic Messages API. */
export async function callClaude(opts: CallOpts): Promise<CallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY not configured" };
  }
  const model = opts.model ?? DEFAULT_MODEL;
  try {
    const body: Record<string, unknown> = {
      model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: opts.system,
      messages: opts.messages,
    };
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
    }
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => `${res.status}`);
      return { ok: false, error: `Anthropic ${res.status}: ${detail}` };
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    // Server-managed tools (web_search, web_fetch) emit non-text content
    // blocks (server_tool_use, web_search_tool_result, etc.) inline. We
    // ignore those and just return the model's final text.
    const text =
      (json.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim() ?? "";
    if (!text) return { ok: false, error: "Empty response from Anthropic" };
    return { ok: true, text, model };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Pull the first JSON object/array out of a model response. Models often
 * wrap JSON in prose or fenced code blocks even when instructed not to.
 */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  // Try fenced ```json ... ``` first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : null;
  for (const src of [candidate, text]) {
    if (!src) continue;
    const start = src.indexOf("{");
    const arrStart = src.indexOf("[");
    const first =
      start === -1
        ? arrStart
        : arrStart === -1
        ? start
        : Math.min(start, arrStart);
    if (first === -1) continue;
    // Walk to the matching closing brace, respecting strings.
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    const open = src[first];
    const close = open === "{" ? "}" : "]";
    for (let i = first; i < src.length; i++) {
      const ch = src[i];
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (ch === "\\") {
          esc = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
      } else if (ch === open) {
        depth += 1;
      } else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    const slice = src.slice(first, end + 1);
    try {
      return JSON.parse(slice) as T;
    } catch {
      continue;
    }
  }
  return null;
}

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
  type: "web_fetch_20260309",
  name: "web_fetch",
  max_uses: 3,
} as const;

export type Message = { role: "user" | "assistant"; content: string };

export type Tool = Record<string, unknown>;

export type ToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "tool"; name: string };

/**
 * System prompt: either a plain string (simple case) or an array of content
 * blocks. Use the array form when you want to attach cache_control to a
 * specific block — Anthropic prompt caching reuses identical prefixes
 * across calls within a 5-minute TTL, charging 10% of normal input cost
 * for cached tokens (and counting at 10% against ITPM).
 */
export type SystemContentBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export type CallOpts = {
  system: string | SystemContentBlock[];
  messages: Message[];
  model?: string;
  maxTokens?: number;
  tools?: Tool[];
  toolChoice?: ToolChoice;
};

export type ToolUseBlock = {
  id: string;
  name: string;
  input: unknown;
};

export type CallResult =
  | {
      ok: true;
      text: string;
      model: string;
      toolUses: ToolUseBlock[];
      raw: unknown;
    }
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
    if (opts.toolChoice) {
      body.tool_choice = opts.toolChoice;
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
      content?: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }>;
    };
    const blocks = json.content ?? [];
    // Server-managed tools (web_search, web_fetch) emit non-text content
    // blocks (server_tool_use, web_search_tool_result, etc.) inline. We
    // ignore those and just return the model's final text + any
    // client-side tool_use blocks the caller asked for.
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    const toolUses: ToolUseBlock[] = blocks
      .filter((b) => b.type === "tool_use" && b.id && b.name)
      .map((b) => ({
        id: b.id as string,
        name: b.name as string,
        input: b.input,
      }));
    if (!text && toolUses.length === 0) {
      return { ok: false, error: "Empty response from Anthropic" };
    }
    return { ok: true, text, model, toolUses, raw: json };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type PingResult = {
  latencyMs: number;
  model: string;
  keyConfigured: boolean;
};

/**
 * Cheapest possible round-trip to the Messages API. Validates that the key
 * works, the model is reachable, and the network path is open. Caps output
 * at 1 token so cost stays trivial.
 */
export async function pingAnthropic(model?: string): Promise<PingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const keyConfigured = Boolean(apiKey);
  const useModel = model ?? DEFAULT_MODEL;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const t0 = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status}`);
    throw new Error(`Anthropic ${res.status}: ${detail}`);
  }
  return { latencyMs, model: useModel, keyConfigured };
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
    // Build the candidate slice. If we never found a matching close
    // brace, the response was almost certainly truncated by max_tokens —
    // close any open string + any open braces and let the lenient parser
    // try to salvage what came through.
    let slice: string;
    if (end === -1) {
      slice = src.slice(first);
      if (inStr) slice += '"';
      for (let d = 0; d < depth; d++) slice += close;
    } else {
      slice = src.slice(first, end + 1);
    }

    // Try strict parse first; fall back to a sanitized version that
    // escapes literal control characters inside string values, which
    // Claude sometimes emits in body_markdown even though it's invalid
    // JSON.
    const parsed =
      tryParseJson<T>(slice) ?? tryParseJson<T>(sanitizeJsonControlChars(slice));
    if (parsed !== null) return parsed;
  }
  return null;
}

function tryParseJson<T>(src: string): T | null {
  try {
    return JSON.parse(src) as T;
  } catch {
    return null;
  }
}

/**
 * Walk a JSON string and replace literal control characters that appear
 * INSIDE string values with their escape sequences. Anything outside a
 * string is left as-is so the structure stays intact.
 */
function sanitizeJsonControlChars(src: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) {
        out += ch;
        esc = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        esc = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inStr = false;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}

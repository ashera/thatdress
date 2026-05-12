import "server-only";

const PINTEREST_API = "https://api.pinterest.com/v5";

/**
 * Pinterest API v5 wrapper. Uses PINTEREST_KEY as a Bearer token —
 * works with trial access tokens (30-day expiry) the developer
 * portal hands out, or with proper user-scoped OAuth tokens. The
 * scopes the token needs are `boards:read` and `pins:write`; we
 * surface 401/403 errors so admins know when the token's expired
 * or under-scoped.
 */

export type PinterestBoard = {
  id: string;
  name: string;
  privacy: string;
};

export type PinterestPinResult =
  | { ok: true; id: string; url: string }
  | { ok: false; status: number; error: string };

type PinterestErrorEnvelope = {
  message?: string;
  code?: number;
};

function token(): string | null {
  const raw = process.env.PINTEREST_KEY?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function pinterestConfigured(): boolean {
  return token() !== null;
}

/**
 * List the authenticated user's boards (first page only — 250
 * boards is plenty for an MVP pin composer dropdown).
 */
export async function listPinterestBoards(): Promise<{
  ok: true;
  boards: PinterestBoard[];
} | { ok: false; status: number; error: string }> {
  const t = token();
  if (!t) {
    return { ok: false, status: 0, error: "PINTEREST_KEY not configured" };
  }
  try {
    const res = await fetch(
      `${PINTEREST_API}/boards?page_size=250`,
      {
        headers: {
          authorization: `Bearer ${t}`,
          accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as
        | PinterestErrorEnvelope
        | undefined;
      return {
        ok: false,
        status: res.status,
        error: body?.message ?? `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      items?: Array<{ id: string; name: string; privacy: string }>;
    };
    return {
      ok: true,
      boards: (json.items ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        privacy: b.privacy,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "network error",
    };
  }
}

export type CreatePinInput = {
  boardId: string;
  link: string;
  imageUrl: string;
  title: string;
  description: string;
  /** Optional alt text for the image (Pinterest accessibility field). */
  altText?: string;
};

export async function createPinterestPin(
  input: CreatePinInput,
): Promise<PinterestPinResult> {
  const t = token();
  if (!t) {
    return { ok: false, status: 0, error: "PINTEREST_KEY not configured" };
  }
  // Pinterest's title and description fields have a 100/500 char
  // limit respectively. Trim defensively so a long listing title
  // doesn't kill the API call.
  const payload = {
    board_id: input.boardId,
    link: input.link,
    title: input.title.slice(0, 100),
    description: input.description.slice(0, 500),
    alt_text: input.altText ? input.altText.slice(0, 500) : undefined,
    media_source: {
      source_type: "image_url",
      url: input.imageUrl,
    },
  };
  try {
    const res = await fetch(`${PINTEREST_API}/pins`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${t}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as
        | PinterestErrorEnvelope
        | undefined;
      return {
        ok: false,
        status: res.status,
        error: body?.message ?? `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      return {
        ok: false,
        status: res.status,
        error: "Pinterest returned a 2xx with no pin id",
      };
    }
    return {
      ok: true,
      id: json.id,
      url: `https://www.pinterest.com/pin/${json.id}/`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "network error",
    };
  }
}

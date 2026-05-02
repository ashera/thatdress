import "server-only";

const API_URL = "https://api.pexels.com/v1/search";

export type PexelsPhoto = {
  id: number;
  url: string;
  src: {
    original: string;
    large2x?: string;
    large?: string;
    medium?: string;
  };
  photographer: string;
  photographer_url: string;
  alt: string;
};

export type PexelsResult =
  | { ok: true; photos: PexelsPhoto[]; nextPage: number | null }
  | { ok: false; error: string };

export async function searchPexels(
  query: string,
  opts: { page?: number; perPage?: number } = {},
): Promise<PexelsResult> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "PEXELS_API_KEY not configured" };
  }
  const params = new URLSearchParams({
    query,
    page: String(opts.page ?? 1),
    per_page: String(opts.perPage ?? 1),
    orientation: "landscape",
  });
  try {
    const res = await fetch(`${API_URL}?${params.toString()}`, {
      headers: { Authorization: apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => `${res.status}`);
      return { ok: false, error: `Pexels ${res.status}: ${detail}` };
    }
    const json = (await res.json()) as {
      photos?: PexelsPhoto[];
      next_page?: string | null;
    };
    return {
      ok: true,
      photos: json.photos ?? [],
      nextPage: json.next_page
        ? Number((opts.page ?? 1) + 1)
        : null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  callClaude,
  extractJson,
  WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/anthropic";

// Structured-output tool for the post-generation call. We tell Claude to
// invoke this tool instead of writing JSON in text — Anthropic returns
// the input as a parsed object, sidestepping every malformed-JSON failure
// (unescaped quotes inside body_markdown, control chars, truncation, etc).
const SUBMIT_POST_TOOL = {
  name: "submit_post",
  description:
    "Submit the generated blog post draft. Call this exactly once with the complete post.",
  input_schema: {
    type: "object",
    required: ["title", "slug", "body_markdown"],
    properties: {
      title: { type: "string", description: "Post title" },
      slug: {
        type: "string",
        description: "URL slug, kebab-case, no leading slash",
      },
      meta_description: {
        type: "string",
        description: "<= 160 chars",
      },
      tags: {
        type: "array",
        items: { type: "string" },
      },
      body_markdown: {
        type: "string",
        description: "Full post body in markdown. Do NOT embed image markdown — use image_placements instead.",
      },
      image_placements: {
        type: "array",
        items: {
          type: "object",
          required: ["slot", "after_heading"],
          properties: {
            slot: { type: "integer" },
            after_heading: {
              type: "string",
              description: "Exact H2 heading text the image should follow",
            },
            caption: { type: "string" },
            layout: {
              type: "string",
              enum: ["full", "right", "left"],
            },
          },
        },
      },
    },
  },
} as const;
import { searchPexels } from "@/lib/pexels";
import { loadBlogBuilderSettings } from "@/lib/blog-builder-settings";
import {
  composePostSystemPrompt,
  composePostUserPrompt,
  type PostPromptExistingPost,
  type PostPromptReferences,
} from "@/lib/blog-post-prompt";
import { loadBlogReferences } from "@/lib/blog-references";

const PHRASE_MAX = 200;
const NOTES_MAX = 2000;

const VALID_INTENTS = new Set([
  "informational",
  "commercial",
  "navigational",
  "transactional",
]);

const VALID_STATUSES = new Set([
  "idea",
  "clustered",
  "drafted",
  "published",
]);

function getString(formData: FormData, key: string, max?: number): string {
  const raw = String(formData.get(key) ?? "").trim();
  if (max && raw.length > max) return raw.slice(0, max);
  return raw;
}

function nullableString(s: string): string | null {
  return s.length === 0 ? null : s;
}

function getOptionalInt(formData: FormData, key: string): number | null {
  const raw = getString(formData, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function getIntentOrNull(formData: FormData, key: string): string | null {
  const v = getString(formData, key).toLowerCase();
  return VALID_INTENTS.has(v) ? v : null;
}

function getStatusOrIdea(formData: FormData, key: string): string {
  const v = getString(formData, key).toLowerCase();
  return VALID_STATUSES.has(v) ? v : "idea";
}

export async function createBlogKeyword(formData: FormData): Promise<void> {
  await requireAdmin();
  const phrase = getString(formData, "phrase", PHRASE_MAX);
  if (!phrase) redirect("/admin/blog/builder/new?error=invalid-phrase");

  const intent = getIntentOrNull(formData, "intent");
  const searchVolume = getOptionalInt(formData, "search_volume");
  const difficulty = getOptionalInt(formData, "difficulty");
  const notes = nullableString(getString(formData, "notes", NOTES_MAX));
  const status = getStatusOrIdea(formData, "status");

  try {
    await query(
      `INSERT INTO blog_keywords (phrase, intent, search_volume, difficulty, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [phrase, intent, searchVolume, difficulty, notes, status],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      redirect("/admin/blog/builder/new?error=duplicate");
    }
    throw err;
  }

  revalidatePath("/admin/blog/builder");
  redirect("/admin/blog/builder?saved=1");
}

export async function bulkCreateBlogKeywords(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const intent = getIntentOrNull(formData, "intent");
  const status = getStatusOrIdea(formData, "status");
  const raw = String(formData.get("phrases") ?? "");
  const phrases = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= PHRASE_MAX);

  if (phrases.length === 0) {
    redirect("/admin/blog/builder/new?error=empty-bulk");
  }

  // One insert; phrase rows fan out via VALUES, intent + status are shared.
  // ON CONFLICT skips dupes against the lowercase-unique index on phrase.
  const placeholders = phrases.map((_, i) => `($${i + 3})`).join(", ");
  await query(
    `INSERT INTO blog_keywords (intent, status, phrase)
     SELECT $1, $2, p.phrase
       FROM (VALUES ${placeholders}) AS p(phrase)
       ON CONFLICT DO NOTHING`,
    [intent, status, ...phrases],
  );

  revalidatePath("/admin/blog/builder");
  redirect(
    `/admin/blog/builder?saved=1&added=${phrases.length}`,
  );
}

export async function updateBlogKeyword(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("keywordId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog/builder");

  const phrase = getString(formData, "phrase", PHRASE_MAX);
  if (!phrase)
    redirect(`/admin/blog/builder/${id}?error=invalid-phrase`);

  const intent = getIntentOrNull(formData, "intent");
  const searchVolume = getOptionalInt(formData, "search_volume");
  const difficulty = getOptionalInt(formData, "difficulty");
  const notes = nullableString(getString(formData, "notes", NOTES_MAX));
  const status = getStatusOrIdea(formData, "status");

  try {
    await query(
      `UPDATE blog_keywords
          SET phrase = $2,
              intent = $3,
              search_volume = $4,
              difficulty = $5,
              notes = $6,
              status = $7,
              updated_at = NOW()
        WHERE id = $1::bigint`,
      [id, phrase, intent, searchVolume, difficulty, notes, status],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      redirect(`/admin/blog/builder/${id}?error=duplicate`);
    }
    throw err;
  }

  revalidatePath("/admin/blog/builder");
  redirect(`/admin/blog/builder/${id}?saved=1`);
}

export async function deleteBlogKeyword(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("keywordId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog/builder");

  await query(`DELETE FROM blog_keywords WHERE id = $1::bigint`, [id]);

  revalidatePath("/admin/blog/builder");
  redirect("/admin/blog/builder?saved=1");
}

// ---------------------------------------------------------------------------
// Cluster generation
// ---------------------------------------------------------------------------

const CLUSTER_SYSTEM_PROMPT = `You are a senior SEO strategist for frockd, a peer-to-peer marketplace for buying and selling pre-loved formal dresses and gowns.

Your job: given one root search keyword, output a tight cluster of 8 to 14 closely-related search queries that share the SAME search intent as the root, suitable for targeting on a single article.

Rules:
- All queries must share the root's search intent (one of: informational, commercial, navigational, transactional). Do NOT mix intents.
- Each query is a phrase a real person would type into Google: 3-10 words, lowercase, no punctuation, no quotes.
- Do not repeat the root verbatim.
- Avoid pure synonyms that would target the same exact page (e.g., "best wedding-guest dress" vs "best wedding guest gown" — pick one).
- Prefer phrases that surface long-tail variations: questions, qualifiers (occasion, designer, size, season, price), and specific sub-topics.

Output ONLY a single valid JSON object — no prose, no markdown fences. Shape:

{
  "name": "short cluster name (typically the root or a tightened version)",
  "intent": "informational" | "commercial" | "navigational" | "transactional",
  "keywords": ["phrase 1", "phrase 2", ...]
}`;

type ClusterPayload = {
  name?: string;
  intent?: string;
  keywords?: string[];
};

const CLUSTER_INTENTS = new Set([
  "informational",
  "commercial",
  "navigational",
  "transactional",
]);

function normalisePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateClusterFromKeyword(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const rootId = String(formData.get("keywordId") ?? "");
  if (!/^\d+$/.test(rootId)) redirect("/admin/blog/builder");

  const r = await query<{
    id: string;
    phrase: string;
    intent: string | null;
    notes: string | null;
  }>(
    `SELECT id::text, phrase, intent, notes
       FROM blog_keywords WHERE id = $1::bigint LIMIT 1`,
    [rootId],
  );
  const root = r.rows[0];
  if (!root)
    redirect(`/admin/blog/builder/${rootId}?error=missing-root`);

  const userPrompt = [
    `Root keyword: "${root.phrase}"`,
    `Existing intent guess: "${root.intent ?? "unknown"}"`,
    `Notes from the editor: "${root.notes ?? "none"}"`,
    "",
    "Return the JSON cluster now.",
  ].join("\n");

  const settings = await loadBlogBuilderSettings();
  const result = await callClaude({
    system: CLUSTER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: settings.clusterMaxTokens,
  });
  if (!result.ok) {
    const code = result.error.includes("ANTHROPIC_API_KEY")
      ? "no-key"
      : "claude-error";
    // eslint-disable-next-line no-console
    console.error("[cluster] Claude call failed", result.error);
    redirect(`/admin/blog/builder/${rootId}?error=${code}`);
  }

  const parsed = extractJson<ClusterPayload>(result.text);
  if (!parsed || !Array.isArray(parsed.keywords) || parsed.keywords.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      "[cluster] Could not parse cluster JSON",
      result.text.slice(0, 400),
    );
    redirect(`/admin/blog/builder/${rootId}?error=bad-output`);
  }

  // Clean + dedupe member phrases (excluding the root verbatim).
  const seen = new Set<string>([normalisePhrase(root.phrase)]);
  const cleaned: string[] = [];
  for (const raw of parsed.keywords) {
    if (typeof raw !== "string") continue;
    const norm = normalisePhrase(raw);
    if (!norm || norm.length > 200) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    cleaned.push(norm);
  }
  if (cleaned.length === 0) {
    redirect(`/admin/blog/builder/${rootId}?error=bad-output`);
  }

  const intent = CLUSTER_INTENTS.has(String(parsed.intent ?? "").toLowerCase())
    ? String(parsed.intent).toLowerCase()
    : root.intent ?? null;
  const name =
    typeof parsed.name === "string" && parsed.name.trim().length > 0
      ? parsed.name.trim().slice(0, 200)
      : root.phrase;

  // Persist: upsert the new keywords, then build cluster + m2m. The unique
  // index on LOWER(phrase) keeps duplicates tidy, and DO UPDATE flips the
  // status so RETURNING gives us IDs for both inserts and existing rows.
  const clusterId = await withTransaction(async (client) => {
    const upsert = await client.query<{ id: string; phrase: string }>(
      `INSERT INTO blog_keywords (phrase, intent, status)
       SELECT phrase, $1, 'clustered'
         FROM unnest($2::text[]) AS phrase
       ON CONFLICT (LOWER(phrase)) DO UPDATE
         SET status = 'clustered', updated_at = NOW()
       RETURNING id::text, phrase`,
      [intent, cleaned],
    );

    // Always include the root in the cluster, marked primary.
    await client.query(
      `UPDATE blog_keywords
          SET status = 'clustered', updated_at = NOW()
        WHERE id = $1::bigint`,
      [root.id],
    );

    const cluster = await client.query<{ id: string }>(
      `INSERT INTO blog_clusters
        (name, intent, primary_keyword_id, model_used)
       VALUES ($1, $2, $3::bigint, $4)
       RETURNING id::text`,
      [name, intent, root.id, result.ok ? result.model : null],
    );
    const cId = cluster.rows[0]!.id;

    // Link rows: root first (primary), then every member.
    await client.query(
      `INSERT INTO blog_keyword_clusters (cluster_id, keyword_id, is_primary)
       VALUES ($1::bigint, $2::bigint, TRUE)
       ON CONFLICT DO NOTHING`,
      [cId, root.id],
    );
    if (upsert.rows.length > 0) {
      const ids = upsert.rows.map((r) => r.id);
      await client.query(
        `INSERT INTO blog_keyword_clusters (cluster_id, keyword_id, is_primary)
         SELECT $1::bigint, kid::bigint, FALSE
           FROM unnest($2::bigint[]) AS kid
         ON CONFLICT DO NOTHING`,
        [cId, ids],
      );
    }

    return cId;
  });

  revalidatePath("/admin/blog/builder");
  revalidatePath(`/admin/blog/builder/${rootId}`);
  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}`);
}

export async function renameBlogCluster(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("clusterId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog/builder");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 200);
  if (!name) redirect(`/admin/blog/builder/cluster/${id}?error=invalid-name`);

  await query(
    `UPDATE blog_clusters SET name = $1, updated_at = NOW()
      WHERE id = $2::bigint`,
    [name, id],
  );
  revalidatePath(`/admin/blog/builder/cluster/${id}`);
  redirect(`/admin/blog/builder/cluster/${id}?saved=1`);
}

export async function removeKeywordFromCluster(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  const keywordId = String(formData.get("keywordId") ?? "");
  if (!/^\d+$/.test(clusterId) || !/^\d+$/.test(keywordId)) {
    redirect("/admin/blog/builder");
  }

  // Refuse to remove the primary — user should regenerate or delete cluster.
  const r = await query<{ is_primary: boolean }>(
    `SELECT is_primary FROM blog_keyword_clusters
      WHERE cluster_id = $1::bigint AND keyword_id = $2::bigint LIMIT 1`,
    [clusterId, keywordId],
  );
  if (r.rows[0]?.is_primary) {
    redirect(`/admin/blog/builder/cluster/${clusterId}?error=cant-remove-primary`);
  }

  await query(
    `DELETE FROM blog_keyword_clusters
      WHERE cluster_id = $1::bigint AND keyword_id = $2::bigint`,
    [clusterId, keywordId],
  );

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

export async function deleteBlogCluster(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("clusterId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog/builder");

  await query(`DELETE FROM blog_clusters WHERE id = $1::bigint`, [id]);
  revalidatePath("/admin/blog/builder");
  redirect("/admin/blog/builder?saved=1");
}

// ---------------------------------------------------------------------------
// SERP analysis (Claude with web_search + web_fetch tools)
// ---------------------------------------------------------------------------

const SERP_SYSTEM_PROMPT = `You are an SEO research assistant.

You will receive a primary keyword. Use the web_search tool to search Google for that exact phrase. From the results, identify the top 3 ORGANIC ranking pages — skip ads, video carousels, and featured snippets. Use the web_fetch tool to fetch each of the top 3 URLs and read their content.

Then analyze the three pages:
- Format: classify each as one of: listicle, tutorial, guide, comparison, review, mixed
- Length: estimate word count of each
- Topics: list the key topics each page actually covers (5-12 per page)

Compute:
- average_word_count across the three
- target_word_count: a range within ±20% of the average, formatted "X-Y words"
- common_topics: topics covered by ALL three pages
- missing_topics_to_add: 1-2 topics that none of the top 3 cover but that a great article on this keyword should include
- recommended_format: which of the four formats (listicle/tutorial/guide/comparison) the data suggests
- format_rationale: one sentence on why

Return ONLY a single valid JSON object — no prose, no markdown fences. Shape:

{
  "keyword": "...",
  "summary": "1-2 sentence read of the SERP landscape",
  "top_results": [
    {
      "rank": 1,
      "url": "...",
      "title": "...",
      "domain": "...",
      "format": "listicle | tutorial | guide | comparison | review | mixed",
      "estimated_word_count": 0,
      "topics_covered": ["..."]
    },
    { "rank": 2, ... },
    { "rank": 3, ... }
  ],
  "average_word_count": 0,
  "target_word_count": "X-Y words",
  "common_topics": ["..."],
  "missing_topics_to_add": ["..."],
  "recommended_format": "listicle | tutorial | guide | comparison",
  "format_rationale": "..."
}`;

type SerpAnalysis = {
  keyword?: string;
  summary?: string;
  top_results?: Array<{
    rank?: number;
    url?: string;
    title?: string;
    domain?: string;
    format?: string;
    estimated_word_count?: number;
    topics_covered?: string[];
  }>;
  average_word_count?: number;
  target_word_count?: string;
  common_topics?: string[];
  missing_topics_to_add?: string[];
  recommended_format?: string;
  format_rationale?: string;
};

export async function runSerpAnalysis(formData: FormData): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  if (!/^\d+$/.test(clusterId))
    redirect("/admin/blog/builder");

  const phrase = await loadClusterSearchPhrase(clusterId);
  if (!phrase)
    redirect(`/admin/blog/builder/cluster/${clusterId}?error=missing-root`);

  const settings = await loadBlogBuilderSettings();
  const result = await callClaude({
    system: SERP_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Primary keyword: "${phrase}"\n\nRun the analysis now and return the JSON.`,
      },
    ],
    tools: [WEB_SEARCH_TOOL, WEB_FETCH_TOOL],
    maxTokens: settings.serpMaxTokens,
  });
  if (!result.ok) {
    const code = result.error.includes("ANTHROPIC_API_KEY")
      ? "no-key"
      : "claude-error";
    // eslint-disable-next-line no-console
    console.error("[serp] Claude call failed", result.error);
    // Cap the detail at 800 chars so we don't construct an absurd URL
    // for a verbose stack trace; Anthropic errors are typically well
    // under that. URI-encode so '?', '&', '#' don't break query parsing.
    const detail = encodeURIComponent(result.error.slice(0, 800));
    redirect(
      `/admin/blog/builder/cluster/${clusterId}?error=${code}&detail=${detail}`,
    );
  }

  const parsed = extractJson<SerpAnalysis>(result.text);
  if (!parsed || !Array.isArray(parsed.top_results)) {
    // eslint-disable-next-line no-console
    console.error(
      "[serp] Could not parse SERP JSON",
      result.text.slice(0, 500),
    );
    const detail = encodeURIComponent(result.text.slice(0, 800));
    redirect(
      `/admin/blog/builder/cluster/${clusterId}?error=bad-output&detail=${detail}`,
    );
  }

  await query(
    `UPDATE blog_clusters
        SET serp_analysis_json = $2::jsonb,
            serp_analyzed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1::bigint`,
    [clusterId, JSON.stringify(parsed)],
  );

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

export async function clearSerpAnalysis(formData: FormData): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  if (!/^\d+$/.test(clusterId))
    redirect("/admin/blog/builder");

  await query(
    `UPDATE blog_clusters
        SET serp_analysis_json = NULL,
            serp_analyzed_at = NULL,
            updated_at = NOW()
      WHERE id = $1::bigint`,
    [clusterId],
  );

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

// ---------------------------------------------------------------------------
// Pexels hero images — up to 5 slots per cluster, each refreshable.
// Search query comes from the cluster's primary keyword phrase, with the
// cluster name as a fallback if no primary is set.
// ---------------------------------------------------------------------------

const IMAGE_SLOTS = 5;

async function loadClusterSearchPhrase(
  clusterId: string,
): Promise<string | null> {
  const r = await query<{ phrase: string | null; name: string }>(
    `SELECT k.phrase AS phrase, c.name AS name
       FROM blog_clusters c
  LEFT JOIN blog_keywords k ON k.id = c.primary_keyword_id
      WHERE c.id = $1::bigint LIMIT 1`,
    [clusterId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return row.phrase ?? row.name ?? null;
}

/** Fetch a fresh Pexels page and return the photos. Pages out clean errors. */
async function fetchPexelsPage(
  phrase: string,
  page: number,
  redirectKey: string,
): Promise<Array<{
  id: number;
  url: string;
  src: { original: string; large2x?: string; large?: string };
  photographer: string;
  photographer_url: string;
  alt: string;
}>> {
  const pexels = await searchPexels(phrase, { page, perPage: IMAGE_SLOTS });
  if (!pexels.ok) {
    const code = pexels.error.includes("PEXELS_API_KEY")
      ? "no-pexels-key"
      : "pexels-error";
    // eslint-disable-next-line no-console
    console.error("[pexels] search failed", pexels.error);
    redirect(`${redirectKey}?error=${code}`);
  }
  if (pexels.photos.length === 0) {
    redirect(`${redirectKey}?error=no-pexels-results`);
  }
  return pexels.photos;
}

type PexelsPick = {
  id: number;
  url: string;
  src: { original: string; large2x?: string; large?: string };
  photographer: string;
  photographer_url: string;
  alt: string;
};

async function upsertImageSlot(
  clusterId: string,
  slot: number,
  page: number,
  pick: PexelsPick,
  altFallback: string,
  searchPhrase: string | null,
): Promise<void> {
  // search_phrase is set on INSERT but NOT updated on conflict — refreshes
  // preserve whatever phrase the slot was originally created with.
  await query(
    `INSERT INTO blog_cluster_images
       (cluster_id, slot, source, source_id, url_large, url_original,
        source_url, photographer, photographer_url, alt, page_offset,
        include_in_post, search_phrase)
     VALUES ($1::bigint, $2::int, 'pexels', $3, $4, $5, $6, $7, $8, $9, $10,
             COALESCE(
               (SELECT include_in_post FROM blog_cluster_images
                  WHERE cluster_id = $1::bigint AND slot = $2::int),
               TRUE), $11)
     ON CONFLICT (cluster_id, slot) DO UPDATE
       SET source = EXCLUDED.source,
           source_id = EXCLUDED.source_id,
           url_large = EXCLUDED.url_large,
           url_original = EXCLUDED.url_original,
           source_url = EXCLUDED.source_url,
           photographer = EXCLUDED.photographer,
           photographer_url = EXCLUDED.photographer_url,
           alt = EXCLUDED.alt,
           page_offset = EXCLUDED.page_offset,
           updated_at = NOW()`,
    [
      clusterId,
      slot,
      String(pick.id),
      pick.src.large2x ?? pick.src.large ?? pick.src.original,
      pick.src.original,
      pick.url,
      pick.photographer,
      pick.photographer_url,
      pick.alt ?? altFallback,
      page,
      searchPhrase,
    ],
  );
}

export async function findInitialImages(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  if (!/^\d+$/.test(clusterId)) redirect("/admin/blog/builder");

  const phrase = await loadClusterSearchPhrase(clusterId);
  if (!phrase)
    redirect(`/admin/blog/builder/cluster/${clusterId}?error=missing-root`);

  const photos = await fetchPexelsPage(
    phrase,
    1,
    `/admin/blog/builder/cluster/${clusterId}`,
  );
  for (let i = 0; i < IMAGE_SLOTS && i < photos.length; i++) {
    // Primary slots store NULL search_phrase — the cluster's primary
    // keyword is the implicit source.
    await upsertImageSlot(clusterId, i, 1, photos[i], phrase, null);
  }

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

export async function refreshImageSlot(formData: FormData): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  const slotRaw = String(formData.get("slot") ?? "");
  if (!/^\d+$/.test(clusterId) || !/^\d+$/.test(slotRaw))
    redirect("/admin/blog/builder");
  const slot = Math.max(0, Number(slotRaw));

  // Use the slot's stored search_phrase if it has one (custom-keyword
  // slots ≥ 5); fall back to the cluster's primary keyword otherwise.
  const slotRowRes = await query<{ search_phrase: string | null }>(
    `SELECT search_phrase FROM blog_cluster_images
      WHERE cluster_id = $1::bigint AND slot = $2::int LIMIT 1`,
    [clusterId, slot],
  );
  const storedPhrase = slotRowRes.rows[0]?.search_phrase ?? null;
  const phrase =
    storedPhrase ?? (await loadClusterSearchPhrase(clusterId));
  if (!phrase)
    redirect(`/admin/blog/builder/cluster/${clusterId}?error=missing-root`);

  // Skip every source_id already in any slot for this cluster that shares
  // the same search phrase. Use the highest existing page_offset + 1 so
  // each refresh genuinely advances.
  const existing = await query<{
    source_id: string;
    page_offset: number;
  }>(
    `SELECT source_id, page_offset FROM blog_cluster_images
      WHERE cluster_id = $1::bigint
        AND COALESCE(search_phrase, '') = COALESCE($2::text, '')`,
    [clusterId, storedPhrase],
  );
  const usedIds = new Set(existing.rows.map((r) => r.source_id));
  const maxOffset = existing.rows.reduce(
    (m, r) => Math.max(m, r.page_offset),
    0,
  );

  // Try a few pages of results until we find one not already used.
  let pick: PexelsPick | null = null;
  let pageUsed = maxOffset + 1;
  for (let attempt = 0; attempt < 3 && !pick; attempt++) {
    const page = maxOffset + 1 + attempt;
    const photos = await fetchPexelsPage(
      phrase,
      page,
      `/admin/blog/builder/cluster/${clusterId}`,
    );
    pick = photos.find((p) => !usedIds.has(String(p.id))) ?? null;
    if (pick) pageUsed = page;
  }
  if (!pick) {
    redirect(
      `/admin/blog/builder/cluster/${clusterId}?error=no-pexels-results`,
    );
  }

  await upsertImageSlot(clusterId, slot, pageUsed, pick, phrase, storedPhrase);

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

/**
 * Add an extra image slot fed by a custom search phrase. New slots take
 * the next index after the highest existing slot, but never lower than
 * IMAGE_SLOTS (so primary slots 0–4 stay reserved even if they're empty).
 */
export async function addCustomKeywordImage(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  const rawPhrase = String(formData.get("phrase") ?? "").trim();
  if (!/^\d+$/.test(clusterId)) redirect("/admin/blog/builder");
  if (rawPhrase.length < 2 || rawPhrase.length > 200) {
    redirect(
      `/admin/blog/builder/cluster/${clusterId}?error=invalid-phrase`,
    );
  }
  const phrase = rawPhrase;

  const maxSlotRes = await query<{ max_slot: number | null }>(
    `SELECT MAX(slot)::int AS max_slot FROM blog_cluster_images
      WHERE cluster_id = $1::bigint`,
    [clusterId],
  );
  const maxSlot = maxSlotRes.rows[0]?.max_slot ?? -1;
  const nextSlot = Math.max(IMAGE_SLOTS, maxSlot + 1);

  const photos = await fetchPexelsPage(
    phrase,
    1,
    `/admin/blog/builder/cluster/${clusterId}`,
  );
  await upsertImageSlot(clusterId, nextSlot, 1, photos[0], phrase, phrase);

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

export async function toggleImageInclude(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  const slotRaw = String(formData.get("slot") ?? "");
  if (!/^\d+$/.test(clusterId) || !/^\d+$/.test(slotRaw))
    redirect("/admin/blog/builder");
  const slot = Number(slotRaw);

  await query(
    `UPDATE blog_cluster_images
        SET include_in_post = NOT include_in_post,
            updated_at = NOW()
      WHERE cluster_id = $1::bigint AND slot = $2::int`,
    [clusterId, slot],
  );

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

export async function clearImageSlot(formData: FormData): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  const slotRaw = String(formData.get("slot") ?? "");
  if (!/^\d+$/.test(clusterId) || !/^\d+$/.test(slotRaw))
    redirect("/admin/blog/builder");
  const slot = Number(slotRaw);

  await query(
    `DELETE FROM blog_cluster_images
      WHERE cluster_id = $1::bigint AND slot = $2::int`,
    [clusterId, slot],
  );

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

/**
 * Clear the primary-keyword slots only (slot < IMAGE_SLOTS). Custom-keyword
 * extras (slot ≥ IMAGE_SLOTS) are preserved — clear those individually via
 * clearImageSlot.
 */
export async function clearAllImages(formData: FormData): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  if (!/^\d+$/.test(clusterId)) redirect("/admin/blog/builder");

  await query(
    `DELETE FROM blog_cluster_images
      WHERE cluster_id = $1::bigint AND slot < $2::int`,
    [clusterId, IMAGE_SLOTS],
  );

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  redirect(`/admin/blog/builder/cluster/${clusterId}?saved=1`);
}

// ---------------------------------------------------------------------------
// Generate Post from cluster — calls Claude with the composed prompt and
// persists a draft into blog_posts. Refuses to overwrite an existing draft;
// to regenerate, delete the old post first (the FK is ON DELETE SET NULL).
// ---------------------------------------------------------------------------

type ImageLayout = "full" | "right" | "left";

type GeneratedPostJson = {
  title?: string;
  slug?: string;
  meta_description?: string;
  tags?: string[];
  body_markdown?: string;
  image_placements?: Array<{
    slot?: number;
    after_heading?: string;
    caption?: string;
    layout?: string;
  }>;
};

function normalizeLayout(raw: unknown): ImageLayout {
  if (raw === "full" || raw === "right" || raw === "left") return raw;
  return "full";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

type InjectImage = {
  slot: number;
  url_large: string;
  photographer: string | null;
  alt: string | null;
  source_url: string | null;
};

const HERO_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Fetch the hero candidate's bytes from Pexels so they can be inlined into
 * blog_images. Returns null on any failure (network, oversized, non-image
 * response) — the post will be created without a hero in that case.
 */
/** Persist the latest Generate Post attempt so failures can be inspected
 * from the cluster page without digging through server logs. Best-effort —
 * we never let a logging failure block the redirect. */
async function recordGenAttempt(
  clusterId: string,
  responseText: string,
  error: string | null,
): Promise<void> {
  try {
    await query(
      `UPDATE blog_clusters
          SET last_gen_response_text = $2,
              last_gen_error         = $3,
              last_gen_at            = NOW()
        WHERE id = $1::bigint`,
      [clusterId, responseText, error],
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[post-gen] failed to record attempt", e);
  }
}

async function fetchHeroBytes(
  source: { url_large: string } | null,
): Promise<{ mime: string; data: Buffer } | null> {
  if (!source) return null;
  try {
    const res = await fetch(source.url_large);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > HERO_MAX_BYTES) return null;
    return { mime, data: Buffer.from(ab) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[post-gen] hero fetch failed (non-fatal)", err);
    return null;
  }
}

/**
 * HTML <figure> block for one image. Marked allows raw HTML in markdown
 * and DOMPurify keeps the figure/img/figcaption + class attributes intact,
 * so we can drive layout (full / right / left) via CSS classes.
 */
function imageHtml(
  img: InjectImage,
  caption: string | undefined,
  layout: ImageLayout,
): string {
  const altText = escapeHtml((caption || img.alt || "").trim());
  const photog = escapeHtml(img.photographer ?? "Pexels");
  const link = escapeHtml(img.source_url ?? "https://www.pexels.com");
  const url = escapeHtml(img.url_large);
  const captionHtml = caption
    ? `${escapeHtml(caption)} — <a href="${link}" target="_blank" rel="noopener">Photo by ${photog} on Pexels</a>`
    : `<a href="${link}" target="_blank" rel="noopener">Photo by ${photog} on Pexels</a>`;
  // Blank lines around the figure keep marked from wrapping it in a <p>.
  return [
    "",
    `<figure class="post-image post-image--${layout}">`,
    `  <img src="${url}" alt="${altText}" />`,
    `  <figcaption>${captionHtml}</figcaption>`,
    `</figure>`,
    "",
  ].join("\n");
}

/**
 * Splice Pexels images into the model's markdown body using its
 * image_placements hints (slot + after_heading + caption). Headings are
 * matched case-insensitively, with substring fallback to tolerate small
 * wording drift. Any included image that doesn't get placed gets appended
 * after the body so nothing silently disappears.
 */
function injectImagesIntoBody(opts: {
  bodyMd: string;
  placements: GeneratedPostJson["image_placements"];
  images: InjectImage[];
}): string {
  const lines = opts.bodyMd.split("\n");
  const imagesBySlot = new Map(opts.images.map((i) => [i.slot, i]));
  const placedSlots = new Set<number>();

  function findHeadingLine(target: string): number {
    const t = target.trim().toLowerCase();
    if (!t) return -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (!m) continue;
      const heading = m[2].toLowerCase().replace(/[.!?:;]+$/, "");
      const tNorm = t.replace(/[.!?:;]+$/, "");
      if (
        heading === tNorm ||
        heading.includes(tNorm) ||
        tNorm.includes(heading)
      ) {
        return i;
      }
    }
    return -1;
  }

  if (Array.isArray(opts.placements)) {
    for (const p of opts.placements) {
      const slot = p.slot ?? 0;
      if (placedSlots.has(slot)) continue;
      const img = imagesBySlot.get(slot);
      if (!img || !p.after_heading) continue;
      const idx = findHeadingLine(p.after_heading);
      if (idx === -1) continue;
      const layout = normalizeLayout(p.layout);
      lines.splice(idx + 1, 0, imageHtml(img, p.caption, layout));
      placedSlots.add(slot);
    }
  }

  let result = lines.join("\n");
  const unplaced = opts.images.filter((i) => !placedSlots.has(i.slot));
  if (unplaced.length > 0) {
    result = `${result.trimEnd()}\n\n---\n`;
    for (const img of unplaced) {
      // Fallback layout for unplaced images is full-width — no surrounding
      // text to wrap around.
      result += imageHtml(img, undefined, "full");
    }
  }
  return result;
}

export async function generateBlogPostFromCluster(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const clusterId = String(formData.get("clusterId") ?? "");
  if (!/^\d+$/.test(clusterId)) redirect("/admin/blog/builder");

  // Refuse if the cluster already has a generated post. The FK is ON DELETE
  // SET NULL, so deleting the post clears this and unlocks regeneration.
  const guardRes = await query<{
    name: string;
    intent: string | null;
    generated_post_id: string | null;
    serp_analyzed_at: string | null;
    serp_analysis_json: unknown;
  }>(
    `SELECT name, intent, generated_post_id::text,
            serp_analyzed_at::text, serp_analysis_json
       FROM blog_clusters WHERE id = $1::bigint LIMIT 1`,
    [clusterId],
  );
  const guard = guardRes.rows[0];
  if (!guard) redirect("/admin/blog/builder");
  if (guard.generated_post_id) {
    redirect(
      `/admin/blog/builder/cluster/${clusterId}?error=already-generated`,
    );
  }
  if (!guard.serp_analyzed_at) {
    redirect(`/admin/blog/builder/cluster/${clusterId}?error=missing-serp`);
  }

  const [membersRes, imageRes, refFiles, existingPostsRes, availableTagsRes] =
    await Promise.all([
    query<{
      phrase: string;
      is_primary: boolean;
    }>(
      `SELECT k.phrase, kc.is_primary
         FROM blog_keyword_clusters kc
         JOIN blog_keywords k ON k.id = kc.keyword_id
        WHERE kc.cluster_id = $1::bigint
        ORDER BY kc.is_primary DESC, k.phrase`,
      [clusterId],
    ),
    query<{
      slot: number;
      url_large: string;
      photographer: string | null;
      alt: string | null;
      source_url: string | null;
    }>(
      `SELECT slot, url_large, photographer, alt, source_url
         FROM blog_cluster_images
        WHERE cluster_id = $1::bigint AND include_in_post = TRUE
        ORDER BY slot`,
      [clusterId],
    ),
    loadBlogReferences(),
    // Recently published posts so Claude can drop natural cross-links.
    // Capped at 8 to keep the prompt under the tier-1 ITPM budget.
    query<{ slug: string; title: string; tags: string[] }>(
      `SELECT p.slug,
              p.title,
              COALESCE(
                ARRAY_AGG(t.label) FILTER (WHERE t.id IS NOT NULL),
                ARRAY[]::text[]
              ) AS tags
         FROM blog_posts p
    LEFT JOIN blog_post_tags pt ON pt.post_id = p.id
    LEFT JOIN blog_tags t       ON t.id = pt.tag_id
        WHERE p.published_at IS NOT NULL
          AND p.published_at <= NOW()
        GROUP BY p.id
        ORDER BY p.published_at DESC
        LIMIT 8`,
    ),
    query<{ id: string; label: string }>(
      `SELECT id::text, label FROM blog_tags ORDER BY sort_order, label`,
    ),
  ]);
  if (imageRes.rows.length === 0) {
    redirect(`/admin/blog/builder/cluster/${clusterId}?error=missing-images`);
  }

  const refsByKey = new Map(refFiles.map((f) => [f.key, f.body]));
  const references: PostPromptReferences = {
    voice: refsByKey.get("voice") ?? null,
    humour: refsByKey.get("humour") ?? null,
    opinions: refsByKey.get("opinions") ?? null,
    stats: refsByKey.get("stats") ?? null,
    stories: refsByKey.get("stories") ?? null,
  };

  const existingPosts: PostPromptExistingPost[] = existingPostsRes.rows.map(
    (r) => ({ slug: r.slug, title: r.title, tags: r.tags }),
  );
  const availableTags = availableTagsRes.rows.map((r) => r.label);
  const tagIdsByLowerLabel = new Map(
    availableTagsRes.rows.map((r) => [r.label.toLowerCase(), r.id]),
  );

  const settings = await loadBlogBuilderSettings();
  const referenceBudgets = {
    voice: settings.voiceBudget,
    humour: settings.humourBudget,
    opinions: settings.opinionsBudget,
    stats: settings.statsBudget,
    stories: settings.storiesBudget,
  };
  const systemPrompt = composePostSystemPrompt(references, referenceBudgets);
  const userPrompt = composePostUserPrompt({
    cluster: { name: guard.name, intent: guard.intent },
    members: membersRes.rows.map((r) => ({
      phrase: r.phrase,
      is_primary: r.is_primary,
    })),
    serp: (guard.serp_analysis_json as never) ?? null,
    images: imageRes.rows.map((r) => ({
      slot: r.slot,
      photographer: r.photographer,
      alt: r.alt,
      source_url: r.source_url,
    })),
    references,
    existingPosts,
    availableTags,
    budgets: referenceBudgets,
  });

  const result = await callClaude({
    // System prompt is identical across every cluster's generation
    // (base rules + voice + humour). Marking it cache_control: ephemeral
    // lets Anthropic reuse the cached prefix across calls within a
    // 5-min TTL — 10% of normal input cost on cache hits, and 10%
    // toward ITPM, which buys back rate-limit headroom for back-to-back
    // generations.
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
    // Configurable via /admin/blog/builder/budgets — Anthropic reserves
    // max_tokens against the per-minute ITPM cap up-front, so this is
    // the biggest lever for staying under tier-1 limits.
    maxTokens: settings.postMaxTokens,
    tools: [SUBMIT_POST_TOOL],
    // Force the model to call submit_post — no free-text fallback.
    toolChoice: { type: "tool", name: "submit_post" },
  });
  if (!result.ok) {
    await recordGenAttempt(clusterId, "", result.error);
    const code = result.error.includes("ANTHROPIC_API_KEY")
      ? "no-key"
      : "claude-error";
    // eslint-disable-next-line no-console
    console.error("[post-gen] Claude call failed", result.error);
    redirect(`/admin/blog/builder/cluster/${clusterId}?error=${code}`);
  }

  const submitCall = result.toolUses.find((t) => t.name === "submit_post");
  const parsed = (submitCall?.input ?? null) as GeneratedPostJson | null;
  // Persist whatever Claude sent us (text + raw tool input as JSON) so
  // we can inspect it on the cluster page if anything went sideways.
  const captured = submitCall
    ? `[tool_use submit_post]\n[stop_reason: ${result.stopReason ?? "?"}]\n${JSON.stringify(submitCall.input, null, 2)}`
    : `[stop_reason: ${result.stopReason ?? "?"}]\n${result.text}`;
  if (!parsed || !parsed.title || !parsed.body_markdown) {
    const truncated = result.stopReason === "max_tokens";
    const errMsg = truncated
      ? "Response was truncated by max_tokens before body_markdown completed. Try regenerating — the prompt should target a shorter post now."
      : !submitCall
        ? "submit_post tool was not invoked at all (Claude wrote free text instead)"
        : "submit_post tool was invoked but required fields (title/body_markdown) were missing";
    await recordGenAttempt(clusterId, captured, errMsg);
    // eslint-disable-next-line no-console
    console.error(
      "[post-gen] submit_post incomplete",
      `stop_reason=${result.stopReason ?? "?"}`,
      captured.slice(0, 500),
    );
    redirect(
      `/admin/blog/builder/cluster/${clusterId}?error=${truncated ? "truncated" : "bad-output"}`,
    );
  }

  // First included image becomes the hero banner. We fetch its bytes here
  // so the transaction stays short. A failure to fetch is non-fatal: the
  // post is still created, just without a hero (user can upload one later).
  const heroSource = imageRes.rows[0] ?? null;
  const bodyImageRows = heroSource ? imageRes.rows.slice(1) : imageRes.rows;
  const heroBytes = await fetchHeroBytes(heroSource);

  // Inject the body Pexels images using Claude's placement hints. Anything
  // Claude didn't match to a heading falls through to the bottom so no
  // included image silently disappears.
  const bodyMd = injectImagesIntoBody({
    bodyMd: String(parsed.body_markdown).trim(),
    placements: parsed.image_placements,
    images: bodyImageRows,
  });

  // Slug: prefer Claude's, fall back to slugified title; on conflict,
  // append the cluster id so the insert succeeds.
  const baseSlug =
    slugify(parsed.slug ?? "") || slugify(parsed.title) || `cluster-${clusterId}`;
  const title = String(parsed.title).slice(0, 200);
  const excerpt = parsed.meta_description
    ? String(parsed.meta_description).slice(0, 200)
    : null;

  const postId = await withTransaction(async (client) => {
    let slug = baseSlug;
    let rows: { id: string }[];
    try {
      const r = await client.query<{ id: string }>(
        `INSERT INTO blog_posts (slug, title, excerpt, body_md)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text`,
        [slug, title, excerpt, bodyMd],
      );
      rows = r.rows;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        slug = `${baseSlug}-${clusterId}`;
        const r = await client.query<{ id: string }>(
          `INSERT INTO blog_posts (slug, title, excerpt, body_md)
           VALUES ($1, $2, $3, $4)
           RETURNING id::text`,
          [slug, title, excerpt, bodyMd],
        );
        rows = r.rows;
      } else {
        throw err;
      }
    }
    const id = rows[0]!.id;

    if (heroBytes) {
      const imgRes = await client.query<{ id: string }>(
        `INSERT INTO blog_images (post_id, mime_type, bytes, byte_size)
         VALUES ($1::bigint, $2, $3, $4)
         RETURNING id::text`,
        [id, heroBytes.mime, heroBytes.data, heroBytes.data.length],
      );
      await client.query(
        `UPDATE blog_posts SET hero_image_id = $2::bigint, updated_at = NOW()
          WHERE id = $1::bigint`,
        [id, imgRes.rows[0]!.id],
      );
    }

    // Link any tags Claude returned that match an existing blog_tags row.
    // Unmatched tags are silently dropped — the prompt explicitly tells
    // the model to pick from AVAILABLE TAGS, so anything else is a miss.
    if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
      const tagIds = new Set<string>();
      for (const raw of parsed.tags) {
        if (typeof raw !== "string") continue;
        const id = tagIdsByLowerLabel.get(raw.toLowerCase().trim());
        if (id) tagIds.add(id);
      }
      for (const tagId of tagIds) {
        await client.query(
          `INSERT INTO blog_post_tags (post_id, tag_id)
           VALUES ($1::bigint, $2::bigint)
           ON CONFLICT DO NOTHING`,
          [id, tagId],
        );
      }
    }

    await client.query(
      `UPDATE blog_clusters
          SET generated_post_id = $2::bigint, updated_at = NOW()
        WHERE id = $1::bigint`,
      [clusterId, id],
    );
    return id;
  });

  await recordGenAttempt(clusterId, captured, null);

  revalidatePath(`/admin/blog/builder/cluster/${clusterId}`);
  revalidatePath(`/admin/blog/${postId}/edit`);
  revalidatePath("/admin/blog");
  redirect(`/admin/blog/${postId}/edit?saved=1&from-cluster=${clusterId}`);
}

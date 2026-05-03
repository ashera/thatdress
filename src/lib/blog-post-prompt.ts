// Composes the system + user prompt that the Generate Post action would
// send to Claude. Kept as pure strings (no SDK calls) so the cluster page
// can render a preview dialog before any real send.

type SerpTopResult = {
  rank?: number;
  url?: string;
  title?: string;
  domain?: string;
  format?: string;
  estimated_word_count?: number;
  topics_covered?: string[];
};

export type PostPromptSerp = {
  summary?: string;
  top_results?: SerpTopResult[];
  average_word_count?: number;
  target_word_count?: string;
  common_topics?: string[];
  missing_topics_to_add?: string[];
  recommended_format?: string;
  format_rationale?: string;
};

export type PostPromptCluster = {
  name: string;
  intent: string | null;
};

export type PostPromptMember = {
  phrase: string;
  is_primary: boolean;
};

export type PostPromptImage = {
  slot: number;
  photographer: string | null;
  alt: string | null;
  source_url: string | null;
};

/**
 * Editorial reference content pulled from the references/ markdown files.
 * voice and humour shape the character of the writer; opinions, stats and
 * stories are raw materials the model selects from. Any field can be null
 * if the underlying file is missing — the prompt skips empty sections.
 */
export type PostPromptReferences = {
  voice: string | null;
  humour: string | null;
  opinions: string | null;
  stats: string | null;
  stories: string | null;
};

const POST_SYSTEM_BASE = `You are a senior content writer for ebikeflip, a peer-to-peer marketplace for buying and selling used electric bikes (eBikes).

Given a keyword cluster, a SERP landscape analysis, hero images, and editorial reference materials, write a single complete blog post that targets the cluster's primary keyword while naturally covering its related queries.

Rules:
- Title and first paragraph must clearly target the primary keyword.
- Match the recommended format (listicle, guide, comparison, tutorial) and stay within ±20% of the target word count.
- Cover EVERY topic in "Common topics" — these are table-stakes per the SERP.
- Treat "Gap topics" as differentiators — cover them deeper than any of the top-ranking pages.
- Weave the secondary cluster keywords in naturally throughout. Do not keyword-stuff.
- Match the VOICE GUIDE in tone, rhythm, and vocabulary — NOT generic AI prose.
- Apply the HUMOUR GUIDE consistently. Dad-energy is mandatory, not decorative.
- Pick 1–2 opinions from the Opinions list and bake them in as editorial stances.
- Use stats VERBATIM — never round, paraphrase, or invent numbers. Cite them naturally.
- Adapt 1–2 stories to fit the article. They turn generic prose into something a human would write.
- For each hero image, output an image_placement object with the slot, the EXACT H2 heading text it should appear after, and a one-sentence caption. The platform inserts the actual image and Pexels credit programmatically — do NOT embed image markdown in body_markdown yourself.
- Output ONLY a single valid JSON object — no prose, no markdown fences. Shape:

{
  "title": "...",
  "slug": "kebab-case-slug",
  "meta_description": "<= 160 chars",
  "tags": ["..."],
  "body_markdown": "the full post in markdown",
  "image_placements": [
    { "slot": 0, "after_heading": "the H2 to place it after", "caption": "..." }
  ]
}`;

export function composePostSystemPrompt(refs: PostPromptReferences): string {
  const parts: string[] = [POST_SYSTEM_BASE];
  if (refs.voice) {
    parts.push("");
    parts.push("=== VOICE GUIDE ===");
    parts.push(refs.voice.trim());
  }
  if (refs.humour) {
    parts.push("");
    parts.push("=== HUMOUR GUIDE ===");
    parts.push(refs.humour.trim());
  }
  return parts.join("\n");
}

export function composePostUserPrompt(opts: {
  cluster: PostPromptCluster;
  members: PostPromptMember[];
  serp: PostPromptSerp | null;
  images: PostPromptImage[];
  references: PostPromptReferences;
}): string {
  const { cluster, members, serp, images, references } = opts;
  const primary = members.find((m) => m.is_primary);
  const secondary = members.filter((m) => !m.is_primary);

  const lines: string[] = [];
  lines.push(`PRIMARY KEYWORD: "${primary?.phrase ?? "(none set)"}"`);
  lines.push(`INTENT: ${cluster.intent ?? "unspecified"}`);
  lines.push(`CLUSTER NAME: "${cluster.name}"`);
  lines.push("");

  lines.push("SECONDARY KEYWORDS (cover these naturally):");
  if (secondary.length === 0) {
    lines.push("- (none)");
  } else {
    for (const m of secondary) lines.push(`- ${m.phrase}`);
  }
  lines.push("");

  lines.push("SERP ANALYSIS");
  if (!serp) {
    lines.push("(not yet run)");
  } else {
    lines.push(
      `Recommended format: ${serp.recommended_format ?? "unspecified"}`,
    );
    lines.push(
      `Target length: ${
        serp.target_word_count ??
        (serp.average_word_count
          ? `~${serp.average_word_count} words`
          : "unspecified")
      }`,
    );
    if (serp.format_rationale) {
      lines.push(`Format rationale: ${serp.format_rationale}`);
    }
    if (serp.summary) {
      lines.push(`SERP summary: ${serp.summary}`);
    }
    lines.push("");
    lines.push("Common topics (must cover):");
    const common = serp.common_topics ?? [];
    if (common.length === 0) lines.push("- (none identified)");
    else for (const t of common) lines.push(`- ${t}`);
    lines.push("");
    lines.push("Gap topics (use as differentiators):");
    const gaps = serp.missing_topics_to_add ?? [];
    if (gaps.length === 0) lines.push("- (none identified)");
    else for (const t of gaps) lines.push(`- ${t}`);
    lines.push("");
    lines.push("Top 3 ranking pages (write something better):");
    const top = serp.top_results ?? [];
    if (top.length === 0) {
      lines.push("(none captured)");
    } else {
      for (const r of top) {
        const head = `${r.rank ?? "?"}. ${r.title ?? "(no title)"} — ${
          r.domain ?? "?"
        } — ${r.format ?? "?"} — ${
          r.estimated_word_count ? `~${r.estimated_word_count} words` : "?"
        }`;
        lines.push(head);
        if (r.topics_covered && r.topics_covered.length > 0) {
          lines.push(`   topics: ${r.topics_covered.join(", ")}`);
        }
      }
    }
  }
  lines.push("");

  lines.push("HERO IMAGES");
  lines.push(
    "The first image below becomes the hero banner at the top of the post automatically — do NOT include it in image_placements. Use image_placements only for the remaining images, referencing them by slot number.",
  );
  if (images.length === 0) {
    lines.push("(none included)");
  } else {
    let isFirst = true;
    for (const img of images) {
      const photog = img.photographer ?? "unknown photographer";
      const alt = img.alt ?? "(no alt)";
      const link = img.source_url ?? "(no link)";
      const tag = isFirst ? " [HERO]" : "";
      lines.push(
        `- Slot ${img.slot}${tag} — by ${photog} — alt: "${alt}" — ${link}`,
      );
      isFirst = false;
    }
  }
  lines.push("");

  lines.push("EDITORIAL MATERIALS");
  lines.push("");
  lines.push("=== OPINIONS (pick 1–2 and bake in as editorial stances) ===");
  lines.push(references.opinions?.trim() ?? "(opinions reference missing)");
  lines.push("");
  lines.push(
    "=== STATS (use verbatim — never round, paraphrase, or invent) ===",
  );
  lines.push(references.stats?.trim() ?? "(stats reference missing)");
  lines.push("");
  lines.push("=== STORIES (adapt 1–2 to fit the article) ===");
  lines.push(references.stories?.trim() ?? "(stories reference missing)");
  lines.push("");

  lines.push("Write the post now and return only the JSON.");

  return lines.join("\n");
}

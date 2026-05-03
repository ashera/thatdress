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

// Character budgets for reference content sent in the prompt. The full
// markdown files stay in references/ for the library viewer; only the
// copy injected into the system/user prompt is clipped. Sized to keep
// input + max_tokens under the 10k tier-1 rate limit (Anthropic
// reserves max_tokens up-front against ITPM, so input alone can't fill
// the budget). At ~4 chars/token, total ref content here is ~2k tokens.
const REFERENCE_BUDGETS = {
  voice: 2000,
  humour: 2000,
  opinions: 1500,
  stats: 1500,
  stories: 1500,
} as const;

function clipForPrompt(body: string | null, maxChars: number): string | null {
  if (!body) return null;
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) return trimmed;
  // Prefer a paragraph break near the cap so the trimmed text doesn't
  // end mid-sentence; fall back to a clean word boundary.
  const slice = trimmed.slice(0, maxChars);
  const lastPara = slice.lastIndexOf("\n\n");
  if (lastPara > maxChars * 0.7) {
    return slice.slice(0, lastPara).trimEnd();
  }
  return slice.replace(/\s+\S*$/, "").trimEnd();
}

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
- Where the topic genuinely connects to one of the EXISTING POSTS YOU CAN LINK TO, drop a markdown link to it ([anchor text](/blog/slug)) — natural cross-references only, never forced. Aim for 1–3 internal links per post if relevant ones exist; zero is fine if none fit.
- Tags: pick 3–5 from AVAILABLE TAGS only. Do not invent new tags — anything outside the list will be discarded.
- For each hero image, supply an image_placement entry with the slot, the EXACT H2 heading text it should appear after, a one-sentence caption, and a layout choice. The platform inserts the actual image and Pexels credit programmatically — do NOT embed image markdown in body_markdown yourself.
- Layout choices for image_placements: "full" = full-width break (use sparingly, for shots that deserve emphasis), "right" = float right with text wrapping, "left" = float left with text wrapping. AIM FOR VARIETY: do not make every image full-width. A good post mixes one full + several right/left so the page has visual rhythm.

Submit your post by calling the submit_post tool exactly once with all fields filled in. Do not write any free-text response — call the tool and stop.`;

export function composePostSystemPrompt(refs: PostPromptReferences): string {
  const parts: string[] = [POST_SYSTEM_BASE];
  const voice = clipForPrompt(refs.voice, REFERENCE_BUDGETS.voice);
  if (voice) {
    parts.push("");
    parts.push("=== VOICE GUIDE ===");
    parts.push(voice);
  }
  const humour = clipForPrompt(refs.humour, REFERENCE_BUDGETS.humour);
  if (humour) {
    parts.push("");
    parts.push("=== HUMOUR GUIDE ===");
    parts.push(humour);
  }
  return parts.join("\n");
}

export type PostPromptExistingPost = {
  slug: string;
  title: string;
  tags: string[];
};

export function composePostUserPrompt(opts: {
  cluster: PostPromptCluster;
  members: PostPromptMember[];
  serp: PostPromptSerp | null;
  images: PostPromptImage[];
  references: PostPromptReferences;
  existingPosts: PostPromptExistingPost[];
  availableTags: string[];
}): string {
  const { cluster, members, serp, images, references, existingPosts, availableTags } = opts;
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
    const common = (serp.common_topics ?? []).slice(0, 10);
    if (common.length === 0) lines.push("- (none identified)");
    else for (const t of common) lines.push(`- ${t}`);
    lines.push("");
    lines.push("Gap topics (use as differentiators):");
    const gaps = (serp.missing_topics_to_add ?? []).slice(0, 4);
    if (gaps.length === 0) lines.push("- (none identified)");
    else for (const t of gaps) lines.push(`- ${t}`);
    lines.push("");
    lines.push("Top 3 ranking pages (write something better):");
    // Cap top_results to 3 and per-page topics to 6 — verbose analyses
    // can otherwise add ~1k tokens to the prompt and tip us over the
    // tier-1 ITPM limit.
    const top = (serp.top_results ?? []).slice(0, 3);
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
        const topics = (r.topics_covered ?? []).slice(0, 6);
        if (topics.length > 0) {
          lines.push(`   topics: ${topics.join(", ")}`);
        }
      }
    }
  }
  lines.push("");

  lines.push("EXISTING POSTS YOU CAN LINK TO (use [anchor](/blog/slug) markdown):");
  if (existingPosts.length === 0) {
    lines.push("(none — skip cross-linking for this post)");
  } else {
    for (const p of existingPosts) {
      const tagSuffix = p.tags.length > 0 ? ` — ${p.tags.join(", ")}` : "";
      lines.push(`- [${p.title}](/blog/${p.slug})${tagSuffix}`);
    }
  }
  lines.push("");

  lines.push("AVAILABLE TAGS (pick 3–5 from this list only):");
  if (availableTags.length === 0) {
    lines.push("(none — leave the tags array empty)");
  } else {
    lines.push(availableTags.join(", "));
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
  lines.push(
    clipForPrompt(references.opinions, REFERENCE_BUDGETS.opinions) ??
      "(opinions reference missing)",
  );
  lines.push("");
  lines.push(
    "=== STATS (use verbatim — never round, paraphrase, or invent) ===",
  );
  lines.push(
    clipForPrompt(references.stats, REFERENCE_BUDGETS.stats) ??
      "(stats reference missing)",
  );
  lines.push("");
  lines.push("=== STORIES (adapt 1–2 to fit the article) ===");
  lines.push(
    clipForPrompt(references.stories, REFERENCE_BUDGETS.stories) ??
      "(stories reference missing)",
  );
  lines.push("");

  lines.push("Write the post now and return only the JSON.");

  return lines.join("\n");
}

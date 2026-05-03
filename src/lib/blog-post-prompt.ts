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

export const POST_SYSTEM_PROMPT = `You are a senior content writer for ebikeflip, a peer-to-peer marketplace for buying and selling used electric bikes (eBikes).

Given a keyword cluster, a SERP landscape analysis, and a set of hero images, write a single complete blog post that targets the cluster's primary keyword while naturally covering its related queries.

Rules:
- Title and first paragraph must clearly target the primary keyword.
- Match the recommended format (listicle, guide, comparison, tutorial) and stay within ±20% of the target word count.
- Cover EVERY topic in "Common topics" — these are table-stakes per the SERP.
- Treat "Gap topics" as differentiators — cover them deeper than any of the top-ranking pages.
- Weave the secondary cluster keywords in naturally throughout. Do not keyword-stuff.
- For each hero image, suggest where to place it with a one-sentence caption. Cite Pexels with a link.
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

export function composePostUserPrompt(opts: {
  cluster: PostPromptCluster;
  members: PostPromptMember[];
  serp: PostPromptSerp | null;
  images: PostPromptImage[];
}): string {
  const { cluster, members, serp, images } = opts;
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

  lines.push("HERO IMAGES (insert these with captions; cite Pexels):");
  if (images.length === 0) {
    lines.push("(none included)");
  } else {
    for (const img of images) {
      const photog = img.photographer ?? "unknown photographer";
      const alt = img.alt ?? "(no alt)";
      const link = img.source_url ?? "(no link)";
      lines.push(
        `- Slot ${img.slot + 1} — by ${photog} — alt: "${alt}" — ${link}`,
      );
    }
  }
  lines.push("");
  lines.push("Write the post now and return only the JSON.");

  return lines.join("\n");
}

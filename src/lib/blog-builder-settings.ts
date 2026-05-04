import "server-only";
import { query } from "@/lib/db";

export type BlogBuilderSettings = {
  /** Characters from references/voice.md sent into the system prompt. */
  voiceBudget: number;
  /** Characters from references/humour.md sent into the system prompt. */
  humourBudget: number;
  /** Characters from references/opinions.md sent into the user prompt. */
  opinionsBudget: number;
  /** Characters from references/stats.md sent into the user prompt. */
  statsBudget: number;
  /** Characters from references/stories.md sent into the user prompt. */
  storiesBudget: number;
  /** max_tokens reservation on the post-generation Claude call. */
  postMaxTokens: number;
  /** max_tokens reservation on the SERP analysis Claude call. */
  serpMaxTokens: number;
  /** max_tokens reservation on the keyword-cluster generation Claude call. */
  clusterMaxTokens: number;
};

export const DEFAULT_BLOG_BUILDER_SETTINGS: BlogBuilderSettings = {
  voiceBudget: 1500,
  humourBudget: 1500,
  opinionsBudget: 1200,
  statsBudget: 1500,
  storiesBudget: 1200,
  postMaxTokens: 3000,
  serpMaxTokens: 3500,
  clusterMaxTokens: 1500,
};

type Row = {
  voice_budget: number;
  humour_budget: number;
  opinions_budget: number;
  stats_budget: number;
  stories_budget: number;
  post_max_tokens: number;
  serp_max_tokens: number;
  cluster_max_tokens: number;
};

export async function loadBlogBuilderSettings(): Promise<BlogBuilderSettings> {
  try {
    const r = await query<Row>(
      `SELECT voice_budget, humour_budget, opinions_budget, stats_budget,
              stories_budget, post_max_tokens, serp_max_tokens, cluster_max_tokens
         FROM blog_builder_settings
        WHERE id = 1
        LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) return DEFAULT_BLOG_BUILDER_SETTINGS;
    return {
      voiceBudget: row.voice_budget,
      humourBudget: row.humour_budget,
      opinionsBudget: row.opinions_budget,
      statsBudget: row.stats_budget,
      storiesBudget: row.stories_budget,
      postMaxTokens: row.post_max_tokens,
      serpMaxTokens: row.serp_max_tokens,
      clusterMaxTokens: row.cluster_max_tokens,
    };
  } catch {
    return DEFAULT_BLOG_BUILDER_SETTINGS;
  }
}

export async function updateBlogBuilderSettings(
  next: BlogBuilderSettings,
): Promise<void> {
  await query(
    `INSERT INTO blog_builder_settings (
        id, voice_budget, humour_budget, opinions_budget, stats_budget,
        stories_budget, post_max_tokens, serp_max_tokens, cluster_max_tokens,
        updated_at
     ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO UPDATE SET
       voice_budget       = EXCLUDED.voice_budget,
       humour_budget      = EXCLUDED.humour_budget,
       opinions_budget    = EXCLUDED.opinions_budget,
       stats_budget       = EXCLUDED.stats_budget,
       stories_budget     = EXCLUDED.stories_budget,
       post_max_tokens    = EXCLUDED.post_max_tokens,
       serp_max_tokens    = EXCLUDED.serp_max_tokens,
       cluster_max_tokens = EXCLUDED.cluster_max_tokens,
       updated_at         = NOW()`,
    [
      next.voiceBudget,
      next.humourBudget,
      next.opinionsBudget,
      next.statsBudget,
      next.storiesBudget,
      next.postMaxTokens,
      next.serpMaxTokens,
      next.clusterMaxTokens,
    ],
  );
}

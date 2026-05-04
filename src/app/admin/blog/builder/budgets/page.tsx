import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  loadBlogBuilderSettings,
  DEFAULT_BLOG_BUILDER_SETTINGS,
} from "@/lib/blog-builder-settings";
import {
  saveBlogBuilderSettings,
  resetBlogBuilderSettings,
} from "@/lib/actions/blog-builder-settings";
import { Button, Field, Input } from "../../../../_components/ui";

export const dynamic = "force-dynamic";

function approxTokens(chars: number): number {
  return Math.round(chars / 4);
}

export default async function BlogBuilderBudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; reset?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const settings = await loadBlogBuilderSettings();

  const refTotalChars =
    settings.voiceBudget +
    settings.humourBudget +
    settings.opinionsBudget +
    settings.statsBudget +
    settings.storiesBudget;

  // Approximate per-call ITPM consumption when the system prompt is a
  // cache-write (i.e. first call). The user-message bits are small;
  // everything is a rough order-of-magnitude indicator, not exact.
  const approxPostInputTokens =
    approxTokens(settings.voiceBudget + settings.humourBudget) * 1.25 +
    approxTokens(
      settings.opinionsBudget + settings.statsBudget + settings.storiesBudget,
    ) +
    400; // SERP/cluster/posts/tags overhead estimate
  const approxPostTotalReservation =
    Math.round(approxPostInputTokens) + settings.postMaxTokens;

  return (
    <div className="page admin-page" style={{ maxWidth: 880 }}>
      <Link href="/admin/blog/builder" className="back-link">
        ← Blog builder
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Blog builder · Prompt budgets</p>
        <h1>Prompt budgets</h1>
        <p className="sub">
          Tune how much editorial reference content is sent to Claude on
          each blog generation, and cap how big the response can be.
        </p>
      </header>

      {sp.saved && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Saved.
        </p>
      )}
      {sp.reset && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Reset to defaults.
        </p>
      )}

      <section className="form-card" style={{ marginBottom: "var(--s-7)" }}>
        <h2 className="card-heading">How these work</h2>
        <p>
          The blog builder uses Anthropic&rsquo;s Claude API. Every call
          consumes &ldquo;input tokens per minute&rdquo; (ITPM) from your
          Anthropic rate-limit pool. Tier 1 caps you at <strong>10,000 ITPM</strong>{" "}
          — and Anthropic counts both your prompt size <em>and</em> the
          maximum response length you ask for, <strong>up front</strong>,
          against that cap.
        </p>
        <p>
          If you exceed 10k tokens of activity in a 60-second window you
          get a <code>429 rate_limit_error</code>. Two requests in quick
          succession (e.g. running SERP analysis then immediately
          generating a post) frequently trip this — the SERP call&rsquo;s
          reservation is still occupying the window when the post-gen
          call lands.
        </p>
        <p>
          Roughly <strong>4 characters ≈ 1 token</strong>, so a 1,500-char
          budget is about 375 input tokens. The system prompt is
          ephemeral-cached, so on subsequent calls within 5 minutes the
          cached portion costs ~10% of its normal ITPM weight.
        </p>
      </section>

      <form action={saveBlogBuilderSettings}>
        <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
          <h2 className="card-heading">Reference budgets (characters)</h2>
          <p className="card-sub">
            How many characters from each <code>references/*.md</code>{" "}
            file get clipped into the prompt. Files are clipped at the
            nearest paragraph break above the cap; the full files stay in
            the repo for the library viewer.
          </p>

          <Field
            label="Voice budget"
            htmlFor="voiceBudget"
            help="Defines who's writing — persona, sentence rhythm, words to use/avoid. Lower if posts feel over-styled; raise if posts read generic."
          >
            <Input
              id="voiceBudget"
              name="voiceBudget"
              type="number"
              min={100}
              max={10000}
              step={50}
              defaultValue={String(settings.voiceBudget)}
              required
            />
          </Field>

          <Field
            label="Humour budget"
            htmlFor="humourBudget"
            help="The dryness rules, parenthetical asides, anti-AI tells. Lower if posts feel forced; raise if posts read flat."
          >
            <Input
              id="humourBudget"
              name="humourBudget"
              type="number"
              min={100}
              max={10000}
              step={50}
              defaultValue={String(settings.humourBudget)}
              required
            />
          </Field>

          <Field
            label="Opinions budget"
            htmlFor="opinionsBudget"
            help="Hot takes the model picks 1–2 from to bake in as editorial stance. Lower if opinions feel forced; raise to give the model more to choose from."
          >
            <Input
              id="opinionsBudget"
              name="opinionsBudget"
              type="number"
              min={100}
              max={10000}
              step={50}
              defaultValue={String(settings.opinionsBudget)}
              required
            />
          </Field>

          <Field
            label="Stats budget"
            htmlFor="statsBudget"
            help="Verbatim numbers the model is told to cite without rounding. Raise if posts ignore your stats; lower only if you have many small numbers."
          >
            <Input
              id="statsBudget"
              name="statsBudget"
              type="number"
              min={100}
              max={10000}
              step={50}
              defaultValue={String(settings.statsBudget)}
              required
            />
          </Field>

          <Field
            label="Stories budget"
            htmlFor="storiesBudget"
            help="Anecdotes the model adapts into the post. Lower if posts come back over-narrative; raise to give the model more material."
          >
            <Input
              id="storiesBudget"
              name="storiesBudget"
              type="number"
              min={100}
              max={10000}
              step={50}
              defaultValue={String(settings.storiesBudget)}
              required
            />
          </Field>

          <p className="card-sub" style={{ marginTop: "var(--s-3)" }}>
            <strong>Current total:</strong> {refTotalChars.toLocaleString()}{" "}
            chars ≈ {approxTokens(refTotalChars).toLocaleString()} input tokens.
          </p>
        </section>

        <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
          <h2 className="card-heading">Output limits (max tokens)</h2>
          <p className="card-sub">
            Caps on the response length, in tokens. Anthropic reserves the
            full <code>max_tokens</code> against your rate-limit pool even
            when the model returns a shorter response. Lowering these is
            the single biggest lever for staying under tier-1 ITPM.
          </p>

          <Field
            label="Post max tokens"
            htmlFor="postMaxTokens"
            help="3,000 fits ~1,800 words plus the JSON tool-call wrapping. Lower if you keep hitting 429; raise if posts come back truncated."
          >
            <Input
              id="postMaxTokens"
              name="postMaxTokens"
              type="number"
              min={500}
              max={8192}
              step={100}
              defaultValue={String(settings.postMaxTokens)}
              required
            />
          </Field>

          <Field
            label="SERP analysis max tokens"
            htmlFor="serpMaxTokens"
            help="Caps the SERP analysis JSON response. ~3,500 is normally enough for a 3-result analysis."
          >
            <Input
              id="serpMaxTokens"
              name="serpMaxTokens"
              type="number"
              min={500}
              max={8192}
              step={100}
              defaultValue={String(settings.serpMaxTokens)}
              required
            />
          </Field>

          <Field
            label="Cluster keywords max tokens"
            htmlFor="clusterMaxTokens"
            help="Caps the keyword-cluster generation response. 1,500 fits a typical 8–14 keyword cluster."
          >
            <Input
              id="clusterMaxTokens"
              name="clusterMaxTokens"
              type="number"
              min={500}
              max={4096}
              step={100}
              defaultValue={String(settings.clusterMaxTokens)}
              required
            />
          </Field>

          <p className="card-sub" style={{ marginTop: "var(--s-3)" }}>
            <strong>Approx. post-generation reservation against ITPM:</strong>{" "}
            ~{Math.round(approxPostTotalReservation).toLocaleString()} tokens
            (input + max_tokens, first call before cache hits). Two of these
            in 60 seconds need to fit under your tier&rsquo;s ITPM limit.
          </p>
        </section>

        <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
          <h2 className="card-heading">Tuning guide</h2>
          <ul style={{ paddingLeft: "1.2em", lineHeight: 1.6 }}>
            <li>
              <strong>Hitting 429 errors regularly?</strong> Lower &ldquo;Post
              max tokens&rdquo; first (each 1,000 tokens shaved buys real
              headroom), then trim reference budgets by ~20%.
            </li>
            <li>
              <strong>Posts feel generic / off-voice?</strong> Raise the
              voice and humour budgets.
            </li>
            <li>
              <strong>Posts ignoring your stats?</strong> Raise the stats
              budget. Stats are usually the first thing to lose to clipping.
            </li>
            <li>
              <strong>Posts coming back truncated?</strong> Raise &ldquo;Post
              max tokens&rdquo; — but watch your rate-limit headroom.
            </li>
            <li>
              <strong>Want to run two generations back-to-back?</strong>{" "}
              Total reservation needs to fit in the ITPM cap. With tier-1
              (10k ITPM) that means each call should land under ~5k tokens.
            </li>
          </ul>
        </section>

        <div
          style={{
            display: "flex",
            gap: "var(--s-3)",
            justifyContent: "flex-end",
          }}
        >
          <Button type="submit" variant="primary" iconRight="check">
            Save
          </Button>
        </div>
      </form>

      <form
        action={resetBlogBuilderSettings}
        style={{ marginTop: "var(--s-5)" }}
      >
        <p className="card-sub" style={{ marginBottom: "var(--s-2)" }}>
          Reset everything to: voice {DEFAULT_BLOG_BUILDER_SETTINGS.voiceBudget},
          humour {DEFAULT_BLOG_BUILDER_SETTINGS.humourBudget}, opinions{" "}
          {DEFAULT_BLOG_BUILDER_SETTINGS.opinionsBudget}, stats{" "}
          {DEFAULT_BLOG_BUILDER_SETTINGS.statsBudget}, stories{" "}
          {DEFAULT_BLOG_BUILDER_SETTINGS.storiesBudget}, post max tokens{" "}
          {DEFAULT_BLOG_BUILDER_SETTINGS.postMaxTokens}, SERP max tokens{" "}
          {DEFAULT_BLOG_BUILDER_SETTINGS.serpMaxTokens}, cluster max tokens{" "}
          {DEFAULT_BLOG_BUILDER_SETTINGS.clusterMaxTokens}.
        </p>
        <Button type="submit" variant="ghost" size="sm">
          Reset to defaults
        </Button>
      </form>
    </div>
  );
}

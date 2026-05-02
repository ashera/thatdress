import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  bulkCreateBlogKeywords,
  createBlogKeyword,
} from "@/lib/actions/blog-builder";
import { Button, Field, Input, Textarea } from "../../../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-phrase": "A phrase is required.",
  "empty-bulk": "Paste at least one phrase.",
  duplicate: "That phrase is already in the bank.",
};

const INTENTS = [
  "informational",
  "commercial",
  "navigational",
  "transactional",
] as const;

const STATUSES = ["idea", "clustered", "drafted", "published"] as const;

export default async function NewKeywordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;
  const message = error ? ERRORS[error] ?? "Something went wrong." : null;

  return (
    <div className="page admin-page" style={{ maxWidth: 720 }}>
      <Link href="/admin/blog/builder" className="back-link">
        ← Keyword bank
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Blog · Builder</p>
        <h1>Add keywords</h1>
        <p className="sub">
          Drop in a single root keyword you want to target, or paste a list
          and bulk-add them.
        </p>
      </header>

      {message && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {message}
        </p>
      )}

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading">Single keyword</h2>
        <p className="card-sub">
          Use this when you want to capture extra metadata (volume,
          difficulty, notes) up front.
        </p>
        <form
          action={createBlogKeyword}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-4)",
          }}
        >
          <Field label="Phrase" htmlFor="phrase">
            <Input
              id="phrase"
              name="phrase"
              required
              maxLength={200}
              placeholder="best ebike for commuting under 2000"
            />
          </Field>
          <div className="grid-2">
            <Field label="Intent" htmlFor="intent">
              <select id="intent" name="intent" className="input" defaultValue="informational">
                <option value="">—</option>
                {INTENTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select
                id="status"
                name="status"
                className="input"
                defaultValue="idea"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid-2">
            <Field
              label="Search volume"
              htmlFor="search_volume"
              help="Monthly searches if you have a number; leave blank otherwise."
            >
              <Input
                id="search_volume"
                name="search_volume"
                type="number"
                min={0}
                max={10_000_000}
              />
            </Field>
            <Field
              label="Difficulty"
              htmlFor="difficulty"
              help="0–100, your own scale."
            >
              <Input
                id="difficulty"
                name="difficulty"
                type="number"
                min={0}
                max={100}
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={2000}
              placeholder="Why this matters, angle to take, internal links to include…"
            />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="primary" iconRight="arrow">
              Add keyword
            </Button>
          </div>
        </form>
      </section>

      <section className="form-card">
        <h2 className="card-heading">Bulk paste</h2>
        <p className="card-sub">
          One phrase per line. Up to a few hundred at once. Duplicates
          (case-insensitive) are skipped silently.
        </p>
        <form
          action={bulkCreateBlogKeywords}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-4)",
          }}
        >
          <div className="grid-2">
            <Field label="Default intent" htmlFor="bulk_intent">
              <select
                id="bulk_intent"
                name="intent"
                className="input"
                defaultValue="informational"
              >
                <option value="">—</option>
                {INTENTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default status" htmlFor="bulk_status">
              <select
                id="bulk_status"
                name="status"
                className="input"
                defaultValue="idea"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Phrases" htmlFor="phrases">
            <Textarea
              id="phrases"
              name="phrases"
              rows={10}
              required
              placeholder={
                "best ebike for commuting under 2000\nare ebikes worth it 2026\nclass 3 ebike laws by state"
              }
              style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}
            />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="dark" iconRight="arrow">
              Add all
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

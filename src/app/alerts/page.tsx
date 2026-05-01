import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { describeSearch } from "@/lib/saved-searches";
import { deleteSavedSearch } from "@/lib/actions/saved-searches";
import { Button, ButtonLink } from "../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "missing-name": "Name your search before saving.",
};

type Row = {
  id: string;
  name: string;
  params_json: Record<string, unknown>;
  last_emailed_at: string | null;
  created_at: string;
};

function formatDate(s: string | null): string {
  if (!s) return "never";
  try {
    return new Date(s).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function rebuildBrowseHref(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.length > 0) search.append(k, item);
      }
    } else if (typeof v === "string" && v.length > 0) {
      search.set(k, v);
    }
  }
  const qs = search.toString();
  return qs ? `/listings?${qs}` : "/listings";
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/alerts");

  const { saved, error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  const result = await query<Row>(
    `SELECT id::text,
            name,
            params_json,
            last_emailed_at::text,
            created_at::text
       FROM saved_searches
      WHERE user_id = $1::bigint
      ORDER BY created_at DESC`,
    [user.id],
  );

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 720, margin: "0 auto" }}>
        <header className="messages-header">
          <p className="eyebrow">Alerts</p>
          <h1>Saved searches</h1>
          <p className="sub">
            We&rsquo;ll email you when new listings match. Save searches from
            the browse page after you&rsquo;ve set the filters you care about.
          </p>
        </header>

        {saved && !errorMessage && (
          <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
            Search saved.
          </p>
        )}
        {errorMessage && (
          <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
            {errorMessage}
          </p>
        )}

        {result.rows.length === 0 ? (
          <div className="empty-state">
            <h3>No saved searches yet</h3>
            <p style={{ margin: "0 0 var(--s-5)" }}>
              Set up filters on the browse page, then click <strong>Save
              this search</strong> to get email alerts when matching
              listings appear.
            </p>
            <ButtonLink href="/listings" variant="primary" iconRight="arrow">
              Browse listings
            </ButtonLink>
          </div>
        ) : (
          <ul className="ticket-list">
            {result.rows.map((s) => (
              <li key={s.id}>
                <div className="ticket-item">
                  <div className="ticket-row">
                    <span className="ticket-subject">{s.name}</span>
                    <Link
                      href={rebuildBrowseHref(s.params_json)}
                      style={{
                        fontSize: 12,
                        color: "var(--volt-700)",
                        textDecoration: "underline",
                      }}
                    >
                      Run now →
                    </Link>
                  </div>
                  <div className="ticket-meta">
                    {describeSearch(s.params_json)} · last emailed{" "}
                    {formatDate(s.last_emailed_at)}
                  </div>
                  <form
                    action={deleteSavedSearch}
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: 6,
                    }}
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

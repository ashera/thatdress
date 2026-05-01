import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { startDraftListing } from "@/lib/actions/listing-wizard";
import { Button } from "../../_components/ui";

export const dynamic = "force-dynamic";

type DraftListItem = {
  id: string;
  title: string | null;
  has_basics: boolean;
  has_class: boolean;
  has_condition: boolean;
  updated_at: string;
};

async function listDraftsForUser(userId: string): Promise<DraftListItem[]> {
  try {
    const r = await query<DraftListItem>(
      `SELECT id::text,
              title,
              (title <> '' AND make_id IS NOT NULL AND model IS NOT NULL AND year IS NOT NULL) AS has_basics,
              (bike_class_id IS NOT NULL AND bike_category_id IS NOT NULL) AS has_class,
              (condition_id IS NOT NULL) AS has_condition,
              created_at::text AS updated_at
         FROM listings
        WHERE seller_id = $1::bigint
          AND is_draft = TRUE
        ORDER BY created_at DESC`,
      [userId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

function nextStepFor(d: DraftListItem): string {
  if (!d.has_basics) return `/listings/new/${d.id}/photos`;
  if (!d.has_class) return `/listings/new/${d.id}/build`;
  if (!d.has_condition) return `/listings/new/${d.id}/condition`;
  return `/listings/new/${d.id}/publish`;
}

export default async function NewListingLandingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const drafts = await listDraftsForUser(user.id);

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 720, margin: "0 auto" }}>
        <p className="eyebrow">Sell your eBike</p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-h1)",
            color: "var(--ink-1)",
            margin: "0 0 var(--s-3)",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          New listing
        </h1>
        <p style={{ color: "var(--ink-3)", margin: "0 0 var(--s-7)" }}>
          We&rsquo;ll walk you through it in four short steps: photos &amp;
          basics, the build, condition, and pricing.
        </p>

        <form action={startDraftListing}>
          <Button type="submit" variant="primary" iconRight="arrow">
            Start a new listing
          </Button>
        </form>

        {drafts.length > 0 && (
          <section style={{ marginTop: "var(--s-7)" }}>
            <h2 className="card-heading" style={{ margin: 0 }}>
              In progress
            </h2>
            <p className="card-sub" style={{ marginTop: 4 }}>
              Pick up where you left off.
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "var(--s-4) 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "var(--s-3)",
              }}
            >
              {drafts.map((d) => (
                <li
                  key={d.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--s-3) var(--s-4)",
                    background: "var(--surface-1, #fff)",
                    border: "1px solid var(--line, #e9e5df)",
                    borderRadius: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>
                      {d.title?.trim() || "Untitled draft"}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                      {!d.has_basics
                        ? "Step 1 of 4 — photos & basics"
                        : !d.has_class
                        ? "Step 2 of 4 — build"
                        : !d.has_condition
                        ? "Step 3 of 4 — condition"
                        : "Step 4 of 4 — publish"}
                    </div>
                  </div>
                  <Link
                    href={nextStepFor(d)}
                    style={{
                      fontWeight: 600,
                      fontSize: "var(--t-body-s)",
                      color: "var(--ink-1)",
                      textDecoration: "none",
                    }}
                  >
                    Continue →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/email";
import {
  ALTERATION_ITEMS,
  estimateAlterations,
  isAlterationKind,
  type AlterationKind,
} from "@/lib/alterations-estimator";
import { Button, ButtonLink } from "../../_components/ui";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const title =
    "Dress alterations cost estimator — what should a tailor charge?";
  const description =
    "What to budget for hem shortening, taking in the bust, adding straps, bead repair, or rebuilding a bodice. Australian metro 2024 ranges.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/tools/alterations-cost` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/tools/alterations-cost`,
      title,
      description,
      siteName: "frockd",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

type RawParams = {
  alteration?: string | string[];
};

function fmtAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function parseSelected(raw: string | string[] | undefined): AlterationKind[] {
  if (raw === undefined) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter(isAlterationKind);
}

export default async function AlterationsCostPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const sp = await searchParams;
  const selectedIds = parseSelected(sp.alteration);
  const result =
    selectedIds.length > 0 ? estimateAlterations(selectedIds) : null;
  const selectedSet = new Set(selectedIds);

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link
          href="/tools"
          style={{
            color: "var(--ink-3)",
            fontSize: "var(--t-body-s)",
            textDecoration: "none",
          }}
        >
          ← All tools
        </Link>

        <header style={{ margin: "var(--s-5) 0 var(--s-7)" }}>
          <p className="eyebrow" style={{ margin: 0, color: "var(--ink-3)" }}>
            frockd tools
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-h1)",
              color: "var(--ink-1)",
              margin: "var(--s-2) 0 var(--s-3)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            What should the tailor charge?
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: "var(--t-body-l)",
              margin: 0,
              maxWidth: "60ch",
              lineHeight: 1.5,
            }}
          >
            Pick what needs doing. We&rsquo;ll estimate the total based on
            Australian metro tailor pricing. Ranges, not single numbers —
            beaded fabric, brand-name dresses, and emergency turnarounds
            all cost more.
          </p>
        </header>

        <form
          method="get"
          action="/tools/alterations-cost"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-5)",
            marginBottom: "var(--s-5)",
          }}
        >
          <section className="form-card">
            <h2 className="card-heading">Pick the alterations</h2>
            <p className="card-sub">
              Tick everything that applies. Total range below updates after
              you submit.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--s-2)",
              }}
            >
              {ALTERATION_ITEMS.map((item) => (
                <label
                  key={item.id}
                  className="check-row"
                  style={{
                    alignItems: "flex-start",
                    padding: "var(--s-3)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 10,
                    background: selectedSet.has(item.id)
                      ? "var(--volt-50)"
                      : "var(--surface)",
                  }}
                >
                  <input
                    type="checkbox"
                    name="alteration"
                    value={item.id}
                    defaultChecked={selectedSet.has(item.id)}
                    style={{ marginTop: 4 }}
                  />
                  <span style={{ display: "block" }}>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: "var(--s-3)",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong style={{ color: "var(--ink-1)" }}>
                        {item.label}
                      </strong>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          color: "var(--ink-3)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtAud(item.lowCents)}–{fmtAud(item.highCents)}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "block",
                        color: "var(--ink-3)",
                        fontSize: "var(--t-body-s)",
                        marginTop: 2,
                      }}
                    >
                      {item.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <div
            style={{
              display: "flex",
              gap: "var(--s-3)",
              justifyContent: "flex-end",
            }}
          >
            <Button type="submit" variant="primary" iconRight="arrow">
              Estimate total
            </Button>
          </div>
        </form>

        {result && result.selected.length > 0 && (
          <section
            className="form-card"
            style={{ marginTop: "var(--s-5)", padding: "var(--s-7)" }}
          >
            <p
              className="eyebrow"
              style={{ margin: 0, color: "var(--ink-3)" }}
            >
              Estimated total
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 56,
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                margin: "var(--s-3) 0 var(--s-2)",
                color: "var(--ink-1)",
              }}
            >
              {fmtAud(result.totalLowCents)} –{" "}
              {fmtAud(result.totalHighCents)}
            </h2>
            <p style={{ color: "var(--ink-3)", margin: 0 }}>
              For {result.selected.length}{" "}
              {result.selected.length === 1 ? "alteration" : "alterations"}{" "}
              at an Australian metro tailor.
            </p>

            {result.hasExpensiveFlag && (
              <div
                style={{
                  marginTop: "var(--s-5)",
                  padding: "var(--s-3) var(--s-4)",
                  background: "var(--warn-100)",
                  border: "1px solid oklch(80% 0.13 85)",
                  borderRadius: 10,
                  fontSize: "var(--t-body-s)",
                  color: "oklch(35% 0.1 70)",
                  lineHeight: 1.5,
                }}
              >
                <strong>Worth pausing here.</strong> A full bodice rebuild
                costs roughly what a great pre-loved dress costs on the
                resale market. Before committing, check if there&rsquo;s a
                better-fitting version already listed.
              </div>
            )}

            <div
              style={{
                marginTop: "var(--s-6)",
                padding: "var(--s-4) var(--s-5)",
                background: "var(--surface-sunken)",
                borderRadius: 12,
                fontSize: "var(--t-body-s)",
                color: "var(--ink-2)",
                lineHeight: 1.7,
              }}
            >
              <strong style={{ color: "var(--ink-1)" }}>Breakdown</strong>
              <ul
                style={{
                  margin: "var(--s-3) 0 0",
                  paddingLeft: "1.2em",
                  listStyle: "disc",
                }}
              >
                {result.selected.map((item) => (
                  <li key={item.id}>
                    {item.label} —{" "}
                    <strong>
                      {fmtAud(item.lowCents)}–{fmtAud(item.highCents)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>

            <p
              style={{
                marginTop: "var(--s-5)",
                fontSize: "var(--t-body-s)",
                color: "var(--ink-3)",
                fontStyle: "italic",
              }}
            >
              Ranges are Australian metro 2024 tailor averages. Lace,
              heavy beadwork, silk satin, and rush turnarounds push
              prices to the upper end. Always get a written quote before
              the tailor cuts anything.
            </p>

            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                marginTop: "var(--s-6)",
                flexWrap: "wrap",
              }}
            >
              <ButtonLink
                href="/listings"
                variant="primary"
                iconRight="arrow"
              >
                Browse better-fitting dresses
              </ButtonLink>
              <ButtonLink
                href="/tools/value-estimator"
                variant="ghost"
              >
                Estimate dress value
              </ButtonLink>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

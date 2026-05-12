import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/email";
import { BUYERS_CHECKLIST } from "@/lib/buyers-checklist";
import { ButtonLink } from "../../_components/ui";
import { ToolHero } from "../../_components/tool-hero";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const title =
    "Pre-loved dress buyer's checklist — what to ask, what to check";
  const description =
    "A due-diligence checklist for buying a designer dress on the resale market. Listing red-flags, questions to ask the seller, and what to physically inspect at handover.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/tools/buyers-checklist` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/tools/buyers-checklist`,
      title,
      description,
      siteName: "frockd",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

const TOTAL_ITEMS = BUYERS_CHECKLIST.reduce(
  (sum, s) => sum + s.items.length,
  0,
);

export default function BuyersChecklistPage() {
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

        <ToolHero
          eyebrow="frockd · tools"
          title="Buyer's checklist"
          subtitle={
            <>
              {TOTAL_ITEMS} things to check before, during, and after a
              pre-loved dress purchase. Tick them off as you go — most
              buyer regret comes from skipping items in section&nbsp;2.
            </>
          }
          /* (0,0) tape measure at the mannequin — inspecting carefully. */
          spriteX="0%"
          spriteY="0%"
          speech="Let me show you what to look for."
          accent={{
            from: "#eff6ff",
            to: "#dbeafe",
            border: "#bfdbfe",
            ink: "#1e40af",
          }}
        />

        {BUYERS_CHECKLIST.map((section, sectionIdx) => (
          <section
            key={section.title}
            className="form-card"
            style={{ marginBottom: "var(--s-5)" }}
          >
            <p
              className="eyebrow"
              style={{ margin: 0, color: "var(--ink-3)" }}
            >
              Section {sectionIdx + 1}
            </p>
            <h2 className="card-heading" style={{ marginTop: 4 }}>
              {section.title}
            </h2>
            <p className="card-sub">{section.blurb}</p>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "var(--s-3) 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "var(--s-2)",
              }}
            >
              {section.items.map((item) => (
                <li key={item.id}>
                  <label
                    className="check-row"
                    style={{
                      alignItems: "flex-start",
                      padding: "var(--s-3) var(--s-4)",
                      border: "1px solid var(--hairline)",
                      borderRadius: 10,
                      background: "var(--surface)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{ marginTop: 4 }}
                    />
                    <span style={{ display: "block" }}>
                      <strong
                        style={{
                          color: "var(--ink-1)",
                          display: "block",
                        }}
                      >
                        {item.label}
                      </strong>
                      <span
                        style={{
                          display: "block",
                          color: "var(--ink-3)",
                          fontSize: "var(--t-body-s)",
                          marginTop: 4,
                          lineHeight: 1.5,
                        }}
                      >
                        {item.why}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section
          className="form-card"
          style={{
            marginTop: "var(--s-7)",
            padding: "var(--s-5) var(--s-6)",
            background: "var(--surface-sunken)",
          }}
        >
          <h3
            className="card-heading"
            style={{ marginTop: 0 }}
          >
            One last thing
          </h3>
          <p style={{ margin: "0 0 var(--s-3)", color: "var(--ink-2)" }}>
            Resale dresses are usually <strong>final sale</strong> — no
            returns, no refunds. The checklist is the protection.
          </p>
          <p style={{ margin: 0, color: "var(--ink-3)", fontSize: "var(--t-body-s)" }}>
            If you&rsquo;re evaluating a specific listing, the{" "}
            <a
              href="/tools/value-estimator"
              style={{ color: "var(--ink-1)", textDecoration: "underline" }}
            >
              value estimator
            </a>{" "}
            tells you whether the asking price is fair, and the{" "}
            <a
              href="/tools/alterations-cost"
              style={{ color: "var(--ink-1)", textDecoration: "underline" }}
            >
              alterations cost tool
            </a>{" "}
            tells you what a less-than-perfect fit will cost to make right.
          </p>
          <div
            style={{
              display: "flex",
              gap: "var(--s-3)",
              marginTop: "var(--s-5)",
              flexWrap: "wrap",
            }}
          >
            <ButtonLink
              href="/listings?trust_status=verified"
              variant="primary"
              iconRight="arrow"
            >
              Browse Verified dresses
            </ButtonLink>
            <ButtonLink href="/listings" variant="ghost">
              See all listings
            </ButtonLink>
          </div>
        </section>
      </main>
    </div>
  );
}

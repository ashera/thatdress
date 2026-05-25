import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/email";
import { BUYERS_CHECKLIST } from "@/lib/buyers-checklist";
import { ButtonLink } from "../../_components/ui";
import { ToolHero } from "../../_components/tool-hero";
import { PrintButton } from "./_print-button";

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
    <div className="page page--pad buyers-checklist-page">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { margin: 18mm; }
              html, body { background: #fff !important; color: #1c1816 !important; }
              .topbar, .footer, .back-link, .tool-hero, .verify-banner,
              .buyers-checklist-page .no-print { display: none !important; }
              .buyers-checklist-page { padding: 0 !important; max-width: 100% !important; }
              .buyers-checklist-page main { max-width: 100% !important; padding: 0 !important; }
              .buyers-checklist-page .form-card {
                box-shadow: none !important;
                border: 1px solid #d4d4d4 !important;
                page-break-inside: avoid;
                break-inside: avoid;
                margin-bottom: 12px !important;
              }
              .buyers-checklist-page .check-row {
                background: #fff !important;
                border: 1px solid #d4d4d4 !important;
                page-break-inside: avoid;
                break-inside: avoid;
              }
              .buyers-checklist-page input[type="checkbox"] {
                appearance: none !important;
                -webkit-appearance: none !important;
                width: 16px !important;
                height: 16px !important;
                border: 1.5px solid #1c1816 !important;
                border-radius: 3px !important;
                background: #fff !important;
              }
              .buyers-checklist-page .print-header { display: block !important; }
            }
            .buyers-checklist-page .print-header { display: none; }
          `,
        }}
      />
      <main>
        <Link
          href="/tools"
          className="back-link"
          style={{
            color: "var(--ink-3)",
            fontSize: "var(--t-body-s)",
            textDecoration: "none",
          }}
        >
          ← All tools
        </Link>

        <div
          className="print-header"
          style={{ marginBottom: "var(--s-5)" }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              margin: "0 0 4px",
              color: "#1c1816",
            }}
          >
            Pre-loved dress buyer&rsquo;s checklist
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#5a534f" }}>
            frockd.com.au/tools/buyers-checklist — {TOTAL_ITEMS} things
            to check before, during, and after a purchase.
          </p>
        </div>

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

        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            margin: "calc(var(--s-5) * -1) 0 var(--s-5)",
          }}
        >
          <PrintButton />
        </div>

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
          className="form-card no-print"
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

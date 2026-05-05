import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/email";

export const revalidate = 86400; // tools list changes rarely

const TOOLS: Array<{
  href: string;
  title: string;
  desc: string;
}> = [
  {
    href: "/tools/value-estimator",
    title: "Value estimator",
    desc: "Find out what your designer dress is worth on the Australian resale market.",
  },
  {
    href: "/tools/alterations-cost",
    title: "Alterations cost",
    desc: "What to budget at the tailor — hem, bust, straps, beading, zippers.",
  },
  {
    href: "/tools/buyers-checklist",
    title: "Buyer's checklist",
    desc: "Due-diligence list for vetting a pre-loved designer dress before you pay.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const title = "frockd tools — calculators for selling pre-loved dresses";
  const description =
    "Pre-loved formal-dress calculators: value estimator, sizing guide, fabric-care reference. Free, no email.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/tools` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/tools`,
      title,
      description,
      siteName: "frockd",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ToolsIndexPage() {
  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 720, margin: "0 auto" }}>
        <header style={{ margin: "0 0 var(--s-7)" }}>
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
            Calculators for sellers and buyers
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
            Quick utilities for valuing, listing, and buying pre-loved
            dresses. Free, no sign-up.
          </p>
        </header>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                style={{
                  display: "block",
                  padding: "var(--s-5) var(--s-6)",
                  background: "var(--surface)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    color: "var(--ink-1)",
                    letterSpacing: "-0.01em",
                    margin: 0,
                  }}
                >
                  {t.title} →
                </div>
                <div
                  style={{
                    color: "var(--ink-3)",
                    fontSize: "var(--t-body-s)",
                    marginTop: 4,
                  }}
                >
                  {t.desc}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

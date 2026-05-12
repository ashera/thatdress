import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/email";

export const revalidate = 86400; // tools list changes rarely

type Tool = {
  href: string;
  title: string;
  desc: string;
  emoji: string;
  accent: { bg: string; border: string; icon: string; chip: string };
  example: { input: string; output: string };
};

const TOOLS: Tool[] = [
  {
    href: "/tools/value-estimator",
    title: "Value estimator",
    desc: "Find out what your designer dress is worth on the Australian resale market.",
    emoji: "💰",
    accent: {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      icon: "#065f46",
      chip: "#065f46",
    },
    example: {
      input: "Carla Zampatti, 2019, ex-retail $1,200, excellent condition",
      output: "estimated resale $480 – $620",
    },
  },
  {
    href: "/tools/alterations-cost",
    title: "Alterations cost",
    desc: "What to budget at the tailor — hem, bust, straps, beading, zippers.",
    emoji: "✂️",
    accent: {
      bg: "#fdf2f8",
      border: "#fbcfe8",
      icon: "#9d174d",
      chip: "#9d174d",
    },
    example: {
      input: "Take-in bodice + shorten 2 inches at the hem",
      output: "$80 – $140 at a Sydney tailor",
    },
  },
  {
    href: "/tools/buyers-checklist",
    title: "Buyer's checklist",
    desc: "Due-diligence list for vetting a pre-loved designer dress before you pay.",
    emoji: "📋",
    accent: {
      bg: "#eff6ff",
      border: "#bfdbfe",
      icon: "#1e40af",
      chip: "#1e40af",
    },
    example: {
      input: "Buying a $600 Camilla and Marc dress",
      output: "12 things to check — 60-second interactive walk-through",
    },
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
                className="tool-card-link"
                style={{
                  display: "flex",
                  gap: "var(--s-5)",
                  alignItems: "flex-start",
                  padding: "var(--s-5) var(--s-6)",
                  background: "var(--surface)",
                  border: "1px solid var(--hairline)",
                  borderLeft: `4px solid ${t.accent.icon}`,
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "inherit",
                  transition: "border-color 120ms, box-shadow 120ms",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: t.accent.bg,
                    border: `1px solid ${t.accent.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    lineHeight: 1,
                    flex: "0 0 auto",
                  }}
                >
                  {t.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
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
                      lineHeight: 1.5,
                    }}
                  >
                    {t.desc}
                  </div>
                  <div
                    style={{
                      marginTop: "var(--s-3)",
                      padding: "10px 12px",
                      background: t.accent.bg,
                      border: `1px dashed ${t.accent.border}`,
                      borderRadius: 8,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--ink-2)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: t.accent.chip,
                        fontWeight: 700,
                        marginRight: 6,
                      }}
                    >
                      Example
                    </span>
                    <span style={{ color: "var(--ink-3)" }}>
                      {t.example.input}
                    </span>
                    <span style={{ color: "var(--ink-4)", margin: "0 6px" }}>
                      →
                    </span>
                    <strong style={{ color: t.accent.chip }}>
                      {t.example.output}
                    </strong>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

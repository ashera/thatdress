import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "eBike tools · ebikeflip",
  description:
    "Free eBike calculators and checks for buyers, sellers, and owners.",
};

const TOOLS: Array<{ href: string; title: string; desc: string; tag: string }> =
  [
    {
      href: "/tools/battery-voltage",
      title: "Battery voltage check",
      desc: "30-second multimeter check that tells you if a used eBike's battery is healthy or tired before you hand over cash.",
      tag: "buyer",
    },
    {
      href: "/tools/range",
      title: "Range calculator",
      desc: "Estimate real-world range for a given battery, assist level, rider weight, and terrain.",
      tag: "buyer",
    },
    {
      href: "/tools/legality",
      title: "AU legality check",
      desc: "Pick your state and the bike's specs — find out if it's road-legal as a pedelec.",
      tag: "buyer",
    },
    {
      href: "/tools/cost-vs-car",
      title: "Cost: eBike vs car",
      desc: "Annual running cost comparison for your commute. Spoiler: not close.",
      tag: "buyer",
    },
    {
      href: "/tools/inspection-checklist",
      title: "Inspection checklist",
      desc: "22 checks across battery, drivetrain, brakes, electronics, frame, and paperwork — with a buy/walk verdict.",
      tag: "buyer",
    },
  ];

export default function ToolsHubPage() {
  return (
    <div className="page page--pad">
      <header style={{ maxWidth: 720, margin: "0 auto var(--s-7)" }}>
        <p
          className="eyebrow"
          style={{ margin: 0, color: "var(--volt-700)" }}
        >
          Tools
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
          Tools for buyers, sellers, and owners
        </h1>
        <p
          style={{
            color: "var(--ink-2)",
            fontSize: 18,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Quick calculators built from the same numbers we use in our buying
          guides. No sign-up, no email — just the answer.
        </p>
      </header>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 auto",
          maxWidth: 960,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "var(--s-4)",
        }}
      >
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              style={{
                display: "block",
                padding: "var(--s-5)",
                background: "#fff",
                border: "1px solid var(--hairline)",
                borderRadius: 12,
                textDecoration: "none",
                color: "inherit",
                height: "100%",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--volt-700)",
                  fontWeight: 600,
                  marginBottom: "var(--s-2)",
                }}
              >
                For {t.tag}s
              </span>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--ink-1)",
                }}
              >
                {t.title}
              </h2>
              <p
                style={{
                  margin: "var(--s-2) 0 0",
                  color: "var(--ink-3)",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {t.desc}
              </p>
              <p
                style={{
                  margin: "var(--s-3) 0 0",
                  color: "var(--ink-2)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Open →
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

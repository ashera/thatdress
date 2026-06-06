import type { Metadata } from "next";
import Image from "next/image";
import { getBaseUrl } from "@/lib/email";
import {
  PARTNER_FREE_MONTHS,
  PARTNER_PLATFORM_FEE_PCT,
} from "@/lib/partner-programme";
import { ButtonLink } from "../_components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const title = "Become a frockd partner — run your region";
  const description =
    "Run an exclusive frockd region: recruit sellers, set your listing fees, and grow a local pre-loved formal-dress marketplace. Free for the first 12 months.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/partners` },
    openGraph: { type: "website", url: `${baseUrl}/partners`, title, description },
  };
}

const STEPS = [
  {
    n: 1,
    title: "Apply for a region",
    body: "Pick an available region and tell us how you'll build it. Each region is exclusive to one partner.",
  },
  {
    n: 2,
    title: "We review & activate",
    body: "We check it's a good fit and activate your region. Your free period starts the day you're approved.",
  },
  {
    n: 3,
    title: "Build & earn",
    body: "Recruit sellers, set the listing fee they pay, and market frockd locally. The listing fees are your revenue.",
  },
];

const BENEFITS = [
  {
    title: "Exclusive territory",
    body: "One partner per region — the local market is yours to grow without competing partners.",
  },
  {
    title: "You set the pricing",
    body: "Choose the listing fee sellers pay in your region, from free to whatever the market supports.",
  },
  {
    title: "Tools built in",
    body: "A partner dashboard with live stats, a full region-listings view, and listing-fee controls.",
  },
  {
    title: "Backed by the platform",
    body: "We run the marketplace, payments groundwork, trust & verification — you focus on your region.",
  },
];

// Tighter than the global .section (which is 96px top/bottom).
const sectionStyle: React.CSSProperties = {
  padding: "var(--s-8) 0",
  borderTop: "1px solid var(--hairline)",
};
const h2Style: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--t-h2)",
  color: "var(--ink-1)",
  letterSpacing: "-0.02em",
  margin: "var(--s-2) 0 var(--s-5)",
};

export default function PartnersLandingPage() {
  return (
    <div className="page">
      {/* Hero — mirrors the home page */}
      <section className="hero">
        <div className="hero-sketch">
          <Image
            src="/dress-sketch-tr-back.png"
            alt="Illustration of a pre-loved formal dress on a hanger"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
          />
        </div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">frockd Partner Programme</p>
            <h1>
              Run your <span className="accent">region.</span>
            </h1>
            <p className="sub">
              Build a local pre-loved formal-dress marketplace in a region
              that&rsquo;s yours alone — recruit sellers, set your listing fees,
              and grow. <strong>{PARTNER_FREE_MONTHS} months free</strong> to get
              established.
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                marginTop: "var(--s-7)",
                flexWrap: "wrap",
              }}
            >
              <ButtonLink
                href="/partners/apply"
                variant="primary"
                size="lg"
                iconRight="arrow"
              >
                Apply to run a region
              </ButtonLink>
              <ButtonLink href="#how" variant="ghost" size="lg">
                How it works
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* The offer */}
      <section style={sectionStyle}>
        <div
          style={{
            padding: "var(--s-5)",
            borderRadius: 14,
            background: "var(--volt-50)",
            border: "1px solid var(--volt-100)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--volt-700)",
              margin: 0,
            }}
          >
            The offer
          </p>
          <h2 style={{ ...h2Style, margin: "var(--s-2) 0" }}>
            {PARTNER_FREE_MONTHS} months free, then a simple share
          </h2>
          <p className="sub" style={{ margin: 0, maxWidth: "62ch" }}>
            Your region is{" "}
            <strong>free to run for the first {PARTNER_FREE_MONTHS} months</strong>{" "}
            — time to build inventory and momentum. After that, a{" "}
            <strong>{PARTNER_PLATFORM_FEE_PCT}% platform fee</strong> applies to
            the listing fees you collect. No upfront cost — you only ever share a
            slice of revenue you&rsquo;re already earning.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ ...sectionStyle, scrollMarginTop: "var(--s-7)" }}>
        <p className="eyebrow">How it works</p>
        <h2 style={h2Style}>Three steps to your region</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "var(--s-4)",
          }}
        >
          {STEPS.map((s) => (
            <div key={s.n} className="form-card" style={{ padding: "var(--s-5)" }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  background: "var(--volt-500)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  marginBottom: "var(--s-3)",
                }}
              >
                {s.n}
              </div>
              <h3 style={{ margin: "0 0 4px", color: "var(--ink-1)", fontSize: "var(--t-h3)" }}>
                {s.title}
              </h3>
              <p className="card-sub" style={{ margin: 0 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section style={sectionStyle}>
        <p className="eyebrow">Why partner</p>
        <h2 style={h2Style}>What you get</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--s-4)",
          }}
        >
          {BENEFITS.map((b) => (
            <div key={b.title} className="form-card" style={{ padding: "var(--s-5)" }}>
              <h3 style={{ margin: "0 0 4px", color: "var(--ink-1)", fontSize: "var(--t-h3)" }}>
                {b.title}
              </h3>
              <p className="card-sub" style={{ margin: 0 }}>
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...sectionStyle, textAlign: "center" }}>
        <h2 style={{ ...h2Style, margin: "0 0 var(--s-4)" }}>
          Ready to claim your region?
        </h2>
        <ButtonLink
          href="/partners/apply"
          variant="primary"
          size="lg"
          iconRight="arrow"
        >
          Apply to run a region
        </ButtonLink>
      </section>
    </div>
  );
}

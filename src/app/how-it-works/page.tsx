import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/email";
import { ButtonLink } from "../_components/ui";

export const revalidate = 86400;

const SELLER_STEPS = [
  {
    n: "01",
    title: "List your dress in six short steps",
    body: "Our wizard walks you through it: basics, photos, style, size & fit, condition, and pricing. Each step takes a minute or two — you can save and come back any time.",
  },
  {
    n: "02",
    title: "Capture the four verification shots",
    body: "Full-length front, back, designer label close-up, and a lining shot. We show you guides for each. These are the photos buyers (and we) use to confirm a dress is the real thing.",
  },
  {
    n: "03",
    title: "Earn the Verified badge",
    body: "When your listing has all four shots plus complete details (designer, size, condition, measurements, retail price) it auto-elevates to Verified. Verified listings sell faster and command better prices.",
  },
  {
    n: "04",
    title: "Buyers reach out",
    body: "Interested buyers message you direct or send you an offer. Replies happen in-app — no phone numbers exchanged unless you want them to be.",
  },
  {
    n: "05",
    title: "Arrange the handover",
    body: "Local pickup, courier, or post — whatever works for you and the buyer. You handle payment between yourselves. frockd doesn't sit in the middle, and there are no listing or sale fees.",
  },
  {
    n: "06",
    title: "Mark as sold",
    body: "One tap on the listing detail page closes it out. Sold listings stay on your profile so other buyers can see your track record.",
  },
];

const BUYER_STEPS = [
  {
    n: "01",
    title: "Pick your region",
    body: "First-time visitors get a quick prompt to choose a metro — Sydney, Melbourne, Brisbane, etc. We then surface listings near you, since most pre-loved dress sales happen with a local handover.",
  },
  {
    n: "02",
    title: "Browse and filter",
    body: "Filter by designer, size, occasion, condition grade, length, fabric, even silhouette. Save searches you keep coming back to and we'll email you when matching listings drop.",
  },
  {
    n: "03",
    title: "Check the trust badge",
    body: "Look for the gold Verified pill. Verified means the seller has uploaded label and lining photos, declared authenticity, and the listing is complete and detailed enough to evaluate without messaging the seller.",
  },
  {
    n: "04",
    title: "Message the seller, or make an offer",
    body: "Use the Contact seller button to start a conversation, or Make an offer with a price you'd actually pay. Sellers can accept, decline, or come back with a counter.",
  },
  {
    n: "05",
    title: "Arrange the buy",
    body: "Local pickup is most common — try the dress, hand over cash or transfer there. Long-distance? Courier or post works too. Payment is between you and the seller; frockd doesn't take a cut.",
  },
  {
    n: "06",
    title: "Spot anything off? Tell us",
    body: "Hit Report listing on any detail page if photos look stolen, the dress looks counterfeit, or the description is dishonest. Reports go to a private admin queue — the seller isn't notified.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const title = "How frockd works — buying and selling pre-loved formal dresses";
  const description =
    "How to list a dress on frockd in six steps, how to find your next dress, and how the Verified badge works. Australia's peer-to-peer pre-loved formal-dress marketplace.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/how-it-works` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/how-it-works`,
      title,
      description,
      siteName: "frockd",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function StepList({ steps }: { steps: typeof SELLER_STEPS }) {
  return (
    <ol
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-5)",
      }}
    >
      {steps.map((s) => (
        <li
          key={s.n}
          style={{
            display: "flex",
            gap: "var(--s-4)",
            alignItems: "flex-start",
          }}
        >
          <span
            aria-hidden
            style={{
              flex: "0 0 auto",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-3)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              minWidth: 28,
              paddingTop: 2,
            }}
          >
            {s.n}
          </span>
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                color: "var(--ink-1)",
                margin: "0 0 var(--s-1)",
                letterSpacing: "-0.005em",
              }}
            >
              {s.title}
            </h3>
            <p
              style={{
                fontSize: 15,
                color: "var(--ink-2)",
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {s.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function HowItWorksPage() {
  const baseUrl = await getBaseUrl();

  // HowTo schema for the seller flow — Google sometimes uses HowTo
  // structured data to enrich SERPs with stepwise snippets. We only
  // mark up one of the two flows because mixing two HowTos on a page
  // confuses the rich-result tester.
  const sellerHowTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to sell a pre-loved formal dress on frockd",
    description:
      "Six-step process for listing a pre-loved formal dress on Australia's peer-to-peer marketplace.",
    totalTime: "PT15M",
    step: SELLER_STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.body,
      url: `${baseUrl}/how-it-works#sellers`,
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${baseUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "How it works",
      },
    ],
  };

  return (
    <div className="page page--pad">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sellerHowTo) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <main style={{ maxWidth: 1024, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            gap: "var(--s-6)",
            alignItems: "center",
            flexWrap: "wrap",
            margin: "0 0 var(--s-7)",
          }}
        >
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <p
              className="eyebrow"
              style={{ margin: 0, color: "var(--ink-3)" }}
            >
              How it works
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
              Selling — and buying — a pre-loved frock, simply.
            </h1>
            <p
              style={{
                color: "var(--ink-2)",
                fontSize: "var(--t-body-l)",
                margin: 0,
                maxWidth: "60ch",
                lineHeight: 1.55,
              }}
            >
              frockd is a peer-to-peer marketplace — sellers list
              direct, buyers reach out direct, and we don&rsquo;t take a
              cut. Our job is the trust layer: photo verification,
              designer data, and a Verified badge that means something.
              Here&rsquo;s how the whole thing works.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/how-it-works.png"
            alt=""
            aria-hidden
            width={280}
            height={280}
            style={{
              flex: "0 0 auto",
              width: "min(280px, 100%)",
              height: "auto",
              display: "block",
            }}
          />
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
            gap: "var(--s-7)",
            marginBottom: "var(--s-7)",
          }}
        >
          <section
            id="sellers"
            style={{
              padding: "var(--s-6)",
              border: "1px solid var(--hairline)",
              borderRadius: 14,
              background: "var(--surface)",
            }}
          >
            <p
              className="eyebrow"
              style={{
                margin: 0,
                color: "var(--ink-3)",
                fontSize: 11,
                letterSpacing: "0.16em",
              }}
            >
              For sellers
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                color: "var(--ink-1)",
                margin: "var(--s-1) 0 var(--s-5)",
                letterSpacing: "-0.01em",
              }}
            >
              List a dress in 15 minutes.
            </h2>
            <StepList steps={SELLER_STEPS} />
            <div style={{ marginTop: "var(--s-6)" }}>
              <ButtonLink
                href="/listings/mine"
                variant="primary"
                iconRight="arrow"
              >
                Start a listing
              </ButtonLink>
            </div>
          </section>

          <section
            id="buyers"
            style={{
              padding: "var(--s-6)",
              border: "1px solid var(--hairline)",
              borderRadius: 14,
              background: "var(--surface)",
            }}
          >
            <p
              className="eyebrow"
              style={{
                margin: 0,
                color: "var(--ink-3)",
                fontSize: 11,
                letterSpacing: "0.16em",
              }}
            >
              For buyers
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                color: "var(--ink-1)",
                margin: "var(--s-1) 0 var(--s-5)",
                letterSpacing: "-0.01em",
              }}
            >
              Find a dress you&rsquo;ll actually wear.
            </h2>
            <StepList steps={BUYER_STEPS} />
            <div style={{ marginTop: "var(--s-6)" }}>
              <ButtonLink
                href="/listings"
                variant="primary"
                iconRight="arrow"
              >
                Browse dresses
              </ButtonLink>
            </div>
          </section>
        </div>

        <section
          style={{
            padding: "var(--s-6)",
            background: "var(--surface-sunken)",
            borderRadius: 14,
            border: "1px solid var(--hairline)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              color: "var(--ink-1)",
              margin: "0 0 var(--s-3)",
              letterSpacing: "-0.01em",
            }}
          >
            What the trust badges actually mean
          </h2>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "var(--s-4)",
            }}
          >
            <li>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "var(--surface)",
                  color: "var(--ink-3)",
                  border: "1px solid var(--hairline)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Self-confirmed
              </span>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--ink-2)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                The default. The seller has filled in the basics but
                hasn&rsquo;t hit every Verified criterion yet.
              </p>
            </li>
            <li>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "#fef3c7",
                  color: "#92400e",
                  border: "1px solid #fcd34d",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                ✓ Verified
              </span>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--ink-2)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                Seller has confirmed authenticity, uploaded label +
                lining shots, posted at least three photos, and the
                listing is complete enough to evaluate without
                messaging.
              </p>
            </li>
            <li>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "#1c1816",
                  color: "#fff",
                  border: "1px solid #1c1816",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                ★ Authenticated
              </span>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--ink-2)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                Coming soon. Confirmed by an authentication partner
                we&rsquo;re onboarding for the highest-value designer
                pieces.
              </p>
            </li>
          </ul>
        </section>

        <section style={{ marginTop: "var(--s-7)", textAlign: "center" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              color: "var(--ink-1)",
              margin: "0 0 var(--s-3)",
              letterSpacing: "-0.01em",
            }}
          >
            Still have a question?
          </h2>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: "var(--t-body)",
              margin: "0 0 var(--s-4)",
              maxWidth: "50ch",
              marginInline: "auto",
              lineHeight: 1.5,
            }}
          >
            Open a ticket — the team replies within a day or so. If
            you&rsquo;d rather poke around first, the{" "}
            <Link
              href="/blog"
              style={{ color: "var(--ink-1)", textDecoration: "underline" }}
            >
              frockd blog
            </Link>{" "}
            covers sizing, fabric care, and how to spot a fake.
          </p>
          <ButtonLink href="/support" variant="quiet">
            Contact support
          </ButtonLink>
        </section>
      </main>
    </div>
  );
}

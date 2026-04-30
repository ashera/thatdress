import Image from "next/image";
import { regionShortName, resolveCurrentRegion } from "@/lib/regions";
import { ButtonLink, Spec } from "./_components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const r = await resolveCurrentRegion();
  const region =
    r.kind === "selected" || r.kind === "auto" ? r.region : null;
  const regionShort = region ? regionShortName(region) : null;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-bike" aria-hidden>
          <Image
            src="/images/big-bike.png"
            alt=""
            fill
            priority
            sizes="(max-width: 900px) 100vw, 60vw"
          />
        </div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Peer-to-peer eBike marketplace</p>
            {regionShort ? (
              <>
                <h1>
                  The <span className="accent">{regionShort}</span> eBike
                  marketplace.
                </h1>
                <p className="sub">
                  <strong>Always free</strong> to list and buy. Connect with
                  riders nearby — verified specs, honest condition, no listing
                  fees, no commission.
                </p>
              </>
            ) : (
              <>
                <h1>
                  Buy &amp; sell <span className="accent">used eBikes</span>{" "}
                  with people you can trust.
                </h1>
                <p className="sub">
                  <strong>Always free</strong> to list and buy. Verified
                  sellers, real specs, honest condition — built for commuters,
                  cargo riders, and weekend cruisers.
                </p>
              </>
            )}
            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                marginTop: "var(--s-7)",
                flexWrap: "wrap",
              }}
            >
              <ButtonLink href="/listings" variant="primary" size="lg" iconRight="arrow">
                Browse listings
              </ButtonLink>
              <ButtonLink href="/listings/new" variant="ghost" size="lg" icon="plus">
                List your bike
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <p className="eyebrow">Built for honest deals</p>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 44,
            color: "var(--ink-1)",
            margin: "0 0 var(--s-7)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            maxWidth: "20ch",
          }}
        >
          Real specs. <span style={{ color: "var(--volt-500)" }}>Real bikes.</span>
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--s-3)",
          }}
        >
          <Spec k="Range" v="20–100" unit="mi" />
          <Spec k="Battery" v="300–800" unit="wh" />
          <Spec k="Top speed" v="20–28" unit="mph" />
          <Spec k="Conditions" v="4" />
        </div>
      </section>
    </div>
  );
}

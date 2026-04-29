import Image from "next/image";
import { query } from "@/lib/db";
import { ButtonLink, Spec } from "./_components/ui";

export const dynamic = "force-dynamic";

type DbStatus =
  | { ok: true; time: string }
  | { ok: false; error: string };

async function getDbStatus(): Promise<DbStatus> {
  try {
    const result = await query<{ now: string }>("SELECT NOW() as now");
    return { ok: true, time: String(result.rows[0]?.now ?? "") };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

async function getListingCount(): Promise<number | null> {
  try {
    const result = await query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM listings",
    );
    return Number(result.rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}

export default async function Home() {
  const [status, listingCount] = await Promise.all([
    getDbStatus(),
    getListingCount(),
  ]);

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
            <h1>
              Buy & sell <span className="accent">used eBikes</span> with people
              you can trust.
            </h1>
            <p className="sub">
              Verified sellers. Real specs. Honest condition. ebikeflip is the
              place to find your next ride — whether you commute, cargo, or
              cruise.
            </p>
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

          <div className="meta-grid">
            <div>
              <b>{listingCount ?? "—"}</b>
              <span>Listings</span>
            </div>
            <div>
              <b>{status.ok ? "Live" : "Down"}</b>
              <span>Database</span>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <span
                className={`status-pill ${status.ok ? "--ok" : "--err"}`}
              >
                <span className="dot" />
                {status.ok ? `Connected · ${status.time}` : status.error}
              </span>
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

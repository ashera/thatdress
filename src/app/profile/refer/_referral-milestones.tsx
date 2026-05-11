import {
  REFERRAL_TIERS as TIERS,
  REFERRAL_TIER_TOP as TOP,
} from "@/lib/referral-tiers";

export function ReferralMilestones({
  friendsListed,
}: {
  friendsListed: number;
}) {
  const reached = TIERS.filter((t) => friendsListed >= t.threshold);
  const nextTier = TIERS.find((t) => friendsListed < t.threshold) ?? null;
  const highest = reached[reached.length - 1] ?? null;

  // Progress fill — capped at the top tier so the bar doesn't
  // overshoot when someone blasts past 10.
  const pct = Math.min(100, (friendsListed / TOP) * 100);

  return (
    <section
      style={{
        padding: "var(--s-5)",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 14,
        marginBottom: "var(--s-5)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--s-3)",
          flexWrap: "wrap",
          marginBottom: "var(--s-3)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            color: "var(--ink-1)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {highest ? (
            <>
              <span aria-hidden style={{ marginRight: 6 }}>
                {highest.emoji}
              </span>
              {highest.label}
            </>
          ) : (
            "Get to your first connection"
          )}
        </h2>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          {friendsListed} friend{friendsListed === 1 ? "" : "s"} listed
        </div>
      </div>

      {/* The bar. Track + filled portion + per-tier markers. */}
      <div
        style={{
          position: "relative",
          height: 10,
          background: "var(--surface-sunken)",
          border: "1px solid var(--hairline)",
          borderRadius: 999,
          marginBottom: "var(--s-4)",
        }}
        role="progressbar"
        aria-valuenow={Math.min(friendsListed, TOP)}
        aria-valuemin={0}
        aria-valuemax={TOP}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "linear-gradient(90deg, #fef3c7 0%, #f59e0b 100%)",
            borderRadius: 999,
            transition: "width 400ms ease-out",
          }}
        />
        {TIERS.map((t) => {
          const left = (t.threshold / TOP) * 100;
          const hit = friendsListed >= t.threshold;
          return (
            <div
              key={t.threshold}
              title={`${t.label} · ${t.threshold} friend${t.threshold === 1 ? "" : "s"}`}
              style={{
                position: "absolute",
                left: `calc(${left}% - 7px)`,
                top: -4,
                width: 14,
                height: 18,
                borderRadius: 999,
                background: hit ? "#1c1816" : "var(--surface)",
                border: `2px solid ${hit ? "#1c1816" : "var(--hairline-strong)"}`,
                boxShadow: hit ? "0 0 0 2px #ffffff" : "0 0 0 2px #ffffff",
              }}
              aria-hidden
            />
          );
        })}
      </div>

      {/* Tier list — labels below the bar with reached/upcoming state */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${TIERS.length}, 1fr)`,
          gap: 8,
          marginBottom: nextTier ? "var(--s-3)" : 0,
        }}
      >
        {TIERS.map((t) => {
          const hit = friendsListed >= t.threshold;
          return (
            <div
              key={t.threshold}
              style={{
                textAlign: "center",
                opacity: hit ? 1 : 0.55,
              }}
              title={t.blurb}
            >
              <div
                style={{
                  fontSize: 18,
                  lineHeight: 1,
                  marginBottom: 2,
                  filter: hit ? "none" : "grayscale(1)",
                }}
                aria-hidden
              >
                {t.emoji}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  color: hit ? "var(--ink-1)" : "var(--ink-3)",
                  lineHeight: 1.2,
                }}
              >
                {t.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  marginTop: 2,
                }}
              >
                {t.threshold} friend{t.threshold === 1 ? "" : "s"}
              </div>
            </div>
          );
        })}
      </div>

      {nextTier && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--ink-3)",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {friendsListed === 0
            ? `One friend listing a Verified dress unlocks ${nextTier.label}.`
            : (() => {
                const remaining = nextTier.threshold - friendsListed;
                return `${remaining} more friend${remaining === 1 ? "" : "s"} listing Verified dresses → ${nextTier.label}.`;
              })()}
        </p>
      )}
      {!nextTier && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--ink-3)",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          Top tier reached. Keep going — every Verified listing still
          earns commission.
        </p>
      )}
    </section>
  );
}

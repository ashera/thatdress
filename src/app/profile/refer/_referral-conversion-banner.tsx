"use client";

import { useEffect, useState } from "react";

const COOKIE = "frockd_friends_seen";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function readSeen(): number {
  if (typeof document === "undefined") return 0;
  const match = document.cookie.match(/(?:^|; )frockd_friends_seen=(\d+)/);
  return match ? parseInt(match[1]!, 10) : 0;
}

function writeSeen(n: number): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${COOKIE}=${n}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Confetti banner that fires when the referrer arrives on
 * /profile/refer and their friendsListed count has grown since
 * their last visit. State is tracked in a cookie holding the
 * last-seen count; the first render after a friend's listing
 * crosses Verified bumps the cookie + animates the banner in.
 * Dismissable; auto-hides on next page load after acknowledgement.
 */
export function ReferralConversionBanner({
  friendsListed,
  latestVerifiedName,
}: {
  friendsListed: number;
  latestVerifiedName: string | null;
}) {
  const [seen, setSeen] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  useEffect(() => {
    // Once we know the seen count, advance the cookie to the
    // current value so the banner doesn't fire again on refresh.
    if (seen !== null && friendsListed > seen) {
      writeSeen(friendsListed);
    }
  }, [seen, friendsListed]);

  if (seen === null) return null; // first paint, waiting for cookie
  if (friendsListed <= seen) return null;
  if (dismissed) return null;

  const newCount = friendsListed - seen;
  const headline =
    latestVerifiedName && newCount === 1
      ? `${latestVerifiedName}'s first listing is Verified.`
      : latestVerifiedName
        ? `${latestVerifiedName} and ${newCount - 1} other${newCount - 1 === 1 ? "" : "s"} crossed Verified.`
        : `${newCount} new friend${newCount === 1 ? "" : "s"} crossed Verified.`;

  return (
    <div
      style={{
        position: "relative",
        padding: "var(--s-5) var(--s-5)",
        background: "linear-gradient(135deg, #fef9c3 0%, #fed7aa 100%)",
        border: "1px solid #fde68a",
        borderRadius: 14,
        marginBottom: "var(--s-5)",
        overflow: "hidden",
        animation: "frockd-banner-in 400ms ease-out",
      }}
      role="status"
      aria-live="polite"
    >
      <ConfettiBurst />
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          background: "transparent",
          border: 0,
          fontSize: 20,
          color: "#78350f",
          cursor: "pointer",
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
      <div style={{ position: "relative" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#78350f",
            marginBottom: 6,
          }}
        >
          🎉 Your loop just landed
        </div>
        <p
          style={{
            margin: "0 0 4px",
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "-0.01em",
            color: "#1c1816",
            lineHeight: 1.2,
          }}
        >
          {headline}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "#3a342f",
            lineHeight: 1.5,
          }}
        >
          That counts toward your tier — and toward commission once
          the rate is published.
        </p>
      </div>
      {/* Keyframes are scoped via a style tag so the component is
          self-contained — no need to add to globals.css. */}
      <style>{`
        @keyframes frockd-banner-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes frockd-confetti-fall {
          0%   { transform: translate(0, -40px) rotate(0deg); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translate(var(--dx, 0), 220px) rotate(540deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const CONFETTI_PIECES = 18;
const COLORS = ["#f59e0b", "#ec4899", "#84cc16", "#06b6d4", "#a855f7"];

/** Inline confetti: a fixed number of coloured pieces that fall once
 *  when the banner renders. Pure CSS keyframes, no JS animation. */
function ConfettiBurst() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: CONFETTI_PIECES }).map((_, i) => {
        const color = COLORS[i % COLORS.length]!;
        const left = ((i * 73) % 100) + (i % 5);
        const delay = (i * 60) % 700;
        const duration = 1400 + ((i * 47) % 800);
        const dx = ((i % 7) - 3) * 14;
        const size = 7 + (i % 3) * 2;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: -10,
              left: `${left}%`,
              width: size,
              height: size,
              background: color,
              borderRadius: i % 2 === 0 ? "50%" : 2,
              animation: `frockd-confetti-fall ${duration}ms ${delay}ms ease-in forwards`,
              ["--dx" as never]: `${dx}px`,
            }}
          />
        );
      })}
    </div>
  );
}

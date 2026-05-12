import type { ReactNode } from "react";

/**
 * Per-tool hero strip used at the top of every /tools/* page.
 * Pairs a seamstress-mascot slot (driven from the same sprite
 * sheet as the listing wizard, /public/frockd-seamstress.png)
 * with a gradient palette matched to the tool's card on
 * /tools index — so visitors get the same visual identity
 * whether they arrived from the hub or a deep link.
 *
 * Sprite is 5×2 grid; each tool re-uses a pose already chosen
 * for its closest wizard analogue (appraising / sewing /
 * measuring). Speech bubble underneath grounds the page with
 * a one-liner in the seamstress's voice.
 */

export type ToolHeroProps = {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  /** Seamstress sprite background-position. Sheet is 5×2 so
   *  valid x values are '0%' / '25%' / '50%' / '75%' / '100%'
   *  and y is '0%' or '100%'. */
  spriteX: string;
  spriteY: string;
  /** One-liner the seamstress 'says' under the mascot. */
  speech: string;
  /** Background gradient for the hero strip. Should match the
   *  tool's card accent on /tools index. */
  accent: {
    from: string;
    to: string;
    border: string;
    ink: string;
  };
};

export function ToolHero({
  eyebrow,
  title,
  subtitle,
  spriteX,
  spriteY,
  speech,
  accent,
}: ToolHeroProps) {
  return (
    <section
      style={{
        position: "relative",
        marginBottom: "var(--s-6)",
        padding: "var(--s-6) var(--s-7)",
        background: `linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)`,
        border: `1px solid ${accent.border}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-6)",
          flexWrap: "wrap",
        }}
      >
        <div
          role="img"
          aria-label="Frockd seamstress mascot"
          style={{
            flex: "0 0 auto",
            width: 120,
            height: 164,
            borderRadius: 14,
            backgroundColor: "rgba(255, 255, 255, 0.45)",
            border: `1px solid ${accent.border}`,
            overflow: "hidden",
            backgroundImage: "url('/frockd-seamstress.png')",
            backgroundSize: "500% 200%",
            backgroundPosition: `${spriteX} ${spriteY}`,
            backgroundRepeat: "no-repeat",
          }}
        />
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <p
            className="eyebrow"
            style={{
              margin: "0 0 var(--s-2)",
              color: accent.ink,
              opacity: 0.85,
            }}
          >
            {eyebrow}
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-h1)",
              color: "var(--ink-1)",
              margin: "0 0 var(--s-3)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            {title}
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
            {subtitle}
          </p>
        </div>
      </div>
      <div
        style={{
          marginTop: "var(--s-5)",
          display: "inline-flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 14px",
          background: "rgba(255, 255, 255, 0.55)",
          border: `1px solid ${accent.border}`,
          borderRadius: 12,
          fontSize: 14,
          color: "var(--ink-2)",
          fontStyle: "italic",
          maxWidth: 520,
        }}
      >
        <span
          aria-hidden
          style={{
            color: accent.ink,
            fontFamily: "var(--font-display)",
            fontSize: 18,
            lineHeight: 1,
            marginTop: 1,
          }}
        >
          “
        </span>
        <span>{speech}</span>
        <span
          aria-hidden
          style={{
            color: accent.ink,
            fontFamily: "var(--font-display)",
            fontSize: 18,
            lineHeight: 1,
            marginTop: 1,
          }}
        >
          ”
        </span>
      </div>
    </section>
  );
}

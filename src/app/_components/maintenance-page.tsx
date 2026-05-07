/**
 * Polite full-screen takeover shown to non-admin viewers when
 * site_settings.maintenance_at has elapsed. The layout decides
 * whether to render this in place of the normal topbar / page tree;
 * this component is just the standalone view.
 */
export function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "var(--s-7) var(--s-5)",
        textAlign: "center",
        background: "var(--surface)",
        color: "var(--ink-1)",
      }}
    >
      <main style={{ maxWidth: 520 }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            margin: "0 0 var(--s-3)",
          }}
        >
          Frockd · Be right back
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            margin: "0 0 var(--s-4)",
            color: "var(--ink-1)",
          }}
        >
          We&rsquo;re tidying up the wardrobe.
        </h1>
        <p
          style={{
            color: "var(--ink-2)",
            fontSize: 17,
            lineHeight: 1.55,
            margin: "0 0 var(--s-5)",
          }}
        >
          Frockd is in scheduled maintenance for a short window. Pop
          back in a few minutes — every listing, every conversation, and
          every saved search will be exactly where you left them.
        </p>
        <p
          style={{
            color: "var(--ink-3)",
            fontSize: 14,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Thanks for your patience — we&rsquo;ll be back very soon.
        </p>
      </main>
    </div>
  );
}

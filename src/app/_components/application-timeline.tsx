import React from "react";

/**
 * Vertical status timeline for a partner application, shown on
 * /partners/apply so an applicant can see the stages of becoming an
 * approved partner and where this application currently sits.
 *
 * Stages (happy path): submitted → under review → [sandbox trial, if one
 * is set up] → approved → region active. A rejected application stops at
 * a terminal "Not approved" stage. Pure server component — no client JS.
 */

type StageState = "done" | "current" | "upcoming" | "rejected";
type Stage = { label: string; description: string; state: StageState };

function stagesFor(status: string, hasSandbox: boolean): Stage[] {
  const approved = status === "approved";
  const rejected = status === "rejected";
  const pending = !approved && !rejected;

  const stages: Stage[] = [
    {
      label: "Application submitted",
      description: "We’ve received your application to run this region.",
      state: "done",
    },
    {
      // Once a sandbox is set up the application has moved past the
      // initial paperwork review into a hands-on trial.
      label: "Under review",
      description: "Our team checks it’s a good fit for the region.",
      state: pending && !hasSandbox ? "current" : "done",
    },
  ];

  if (hasSandbox && !rejected) {
    stages.push({
      label: "Sandbox trial",
      description: "Trial the partner tools in your private test region.",
      state: approved ? "done" : "current",
    });
  }

  if (rejected) {
    stages.push({
      label: "Not approved",
      description:
        "This application wasn’t approved — you’re welcome to apply again.",
      state: "rejected",
    });
    return stages;
  }

  stages.push(
    {
      label: "Approved",
      description: "We’ve approved you to run this region.",
      state: approved ? "done" : "upcoming",
    },
    {
      label: "Region active",
      description: "Your region is live — set your fees and recruit sellers.",
      state: approved ? "current" : "upcoming",
    },
  );
  return stages;
}

function dot(state: StageState): { style: React.CSSProperties; glyph: string } {
  const base: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 999,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
  };
  switch (state) {
    case "done":
      return { style: { ...base, background: "var(--volt-500)", color: "#fff" }, glyph: "✓" };
    case "current":
      return {
        style: {
          ...base,
          background: "var(--volt-500)",
          color: "#fff",
          boxShadow: "0 0 0 4px var(--volt-100)",
        },
        glyph: "",
      };
    case "rejected":
      return { style: { ...base, background: "#c0392b", color: "#fff" }, glyph: "✕" };
    default:
      return {
        style: {
          ...base,
          background: "var(--surface)",
          border: "2px solid var(--hairline-strong)",
          color: "var(--ink-3)",
        },
        glyph: "",
      };
  }
}

export function ApplicationTimeline({
  status,
  hasSandbox = false,
}: {
  status: string;
  hasSandbox?: boolean;
}) {
  const stages = stagesFor(status, hasSandbox);
  return (
    <ol style={{ listStyle: "none", margin: "var(--s-3) 0 0", padding: 0 }}>
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        const d = dot(s.state);
        return (
          <li key={s.label} style={{ display: "flex", gap: 12 }}>
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
              aria-hidden
            >
              <span style={d.style}>{d.glyph}</span>
              {!last && (
                <span
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 20,
                    background:
                      s.state === "done" ? "var(--volt-500)" : "var(--hairline)",
                  }}
                />
              )}
            </div>
            <div style={{ paddingBottom: last ? 0 : "var(--s-4)" }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: s.state === "upcoming" ? "var(--ink-3)" : "var(--ink-1)",
                }}
              >
                {s.label}
                {s.state === "current" && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--volt-700)",
                    }}
                  >
                    You’re here
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
                {s.description}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

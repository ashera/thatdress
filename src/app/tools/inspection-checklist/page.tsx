import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Used eBike inspection checklist · ebikeflip",
  description:
    "Print or fill in at the meet-up. 22 checks across battery, drivetrain, brakes, electronics, frame, and paperwork — with a buy/walk verdict at the end.",
};

type Answer = "pass" | "fail" | "skip";

type Item = {
  id: string;
  label: string;
  hint: string;
  critical?: boolean;
};

type Category = {
  name: string;
  description: string;
  items: Item[];
};

const CATEGORIES: Category[] = [
  {
    name: "Battery",
    description:
      "Most consequential check — battery is 60% of the bike's value.",
    items: [
      {
        id: "b_physical",
        label: "Pack physically intact",
        hint: "No swelling, no impact damage, no scorch marks.",
        critical: true,
      },
      {
        id: "b_age_known",
        label: "Battery age is known",
        hint: "Receipt, app data, or seller confirmation. No paper trail = unknown.",
      },
      {
        id: "b_cycles_known",
        label: "Cycle count is reasonable",
        hint: "Quality cells last 500–1,000 cycles to 80%. Most modern systems show this in their app.",
      },
      {
        id: "b_voltage",
        label: "Voltage at full charge passes spot-check",
        hint: "36V → 42.0V, 48V → 54.6V, 52V → 58.8V. Below the worry threshold = tired cells.",
        critical: true,
      },
      {
        id: "b_charger",
        label: "Original charger included",
        hint: "Aftermarket chargers vary wildly and can shorten pack life.",
      },
    ],
  },
  {
    name: "Drivetrain",
    description: "Faster wear than a regular bike — torque from the motor.",
    items: [
      {
        id: "d_chain",
        label: "Chain wear within tolerance",
        hint: "A chain wear tool ($10) is the cleanest test. Worn chain destroys the cassette quickly.",
      },
      {
        id: "d_cassette",
        label: "Cassette teeth not shark-finned",
        hint: "Sharp, hooked teeth = the cassette has been ridden with a stretched chain.",
      },
      {
        id: "d_shifting",
        label: "Shifting is crisp",
        hint: "Test all gears under light load on the test ride.",
      },
      {
        id: "d_cranks",
        label: "Cranks tight, no play",
        hint: "Wobble side-to-side on the cranks suggests bottom-bracket wear.",
      },
    ],
  },
  {
    name: "Brakes",
    description: "Heavier bike, more stops — brakes get more work than a regular bike.",
    items: [
      {
        id: "br_lever",
        label: "Lever feel firm, not spongy",
        hint: "Should engage well before reaching the bar. Spongy = air in hydraulic line or worn pads.",
        critical: true,
      },
      {
        id: "br_pads",
        label: "Pad thickness adequate",
        hint: "Most disc pads need replacing at 1–1.5mm of pad material.",
      },
      {
        id: "br_rotor",
        label: "Rotors straight and clean",
        hint: "Warped = pulsing brake. Contaminated = squeal + reduced stopping power.",
      },
    ],
  },
  {
    name: "Electronics & motor",
    description: "Easy to test on the ride; harder to fix later.",
    items: [
      {
        id: "e_display",
        label: "Display works, no error codes",
        hint: "Take a photo of the display info screen if the seller will let you.",
        critical: true,
      },
      {
        id: "e_assist",
        label: "All assist levels engage",
        hint: "Cycle through eco / medium / max during the test ride. All should respond.",
      },
      {
        id: "e_lights",
        label: "Integrated lights work (if fitted)",
        hint: "Switch on at the bike, not at the lamp.",
      },
      {
        id: "e_wiring",
        label: "No exposed or damaged wiring",
        hint: "Check where cables exit the frame and around the motor.",
      },
    ],
  },
  {
    name: "Frame & wheels",
    description: "Cheap to inspect, expensive to ignore.",
    items: [
      {
        id: "f_frame",
        label: "Frame intact, no cracks",
        hint: "Look closely at welds — especially around the bottom bracket on mid-drives.",
        critical: true,
      },
      {
        id: "f_headset",
        label: "Headset has no play",
        hint: "Front brake on, rock the bike forward and back. Any clunking = headset bearings.",
      },
      {
        id: "f_tyres",
        label: "Tyres have tread, no sidewall cracking",
        hint: "Old rubber can look fine and still be a flat waiting to happen.",
      },
      {
        id: "f_wheels",
        label: "Wheels run true",
        hint: "Spin each wheel and watch from above — any wobble = a truing job at minimum.",
      },
    ],
  },
  {
    name: "Paperwork & provenance",
    description:
      "The single biggest red-flag category. No paper trail = mystery bike.",
    items: [
      {
        id: "p_receipt",
        label: "Original purchase receipt available",
        hint: "Critical for warranty claims. No receipt = walk.",
        critical: true,
      },
      {
        id: "p_service",
        label: "Service history available",
        hint: "Receipts, app screenshots, or even a written log all count.",
      },
      {
        id: "p_seller_id",
        label: "Seller identity confirmable",
        hint: "Photo ID, address, or a deal at a bike shop neutral location.",
      },
      {
        id: "p_not_stolen",
        label: "Bike doesn't look stolen",
        hint: "Check serial number against the seller's receipt. Trust your gut.",
        critical: true,
      },
    ],
  },
];

type Verdict = {
  label: string;
  detail: string;
  tone: "ok" | "warn" | "bad";
};

function evaluate(answers: Record<string, Answer>): {
  passed: number;
  failed: number;
  total: number;
  pct: number;
  criticalFails: Item[];
  failures: Item[];
  verdict: Verdict;
} {
  let passed = 0;
  let failed = 0;
  const criticalFails: Item[] = [];
  const failures: Item[] = [];
  for (const cat of CATEGORIES) {
    for (const item of cat.items) {
      const a = answers[item.id];
      if (a === "pass") passed += 1;
      else if (a === "fail") {
        failed += 1;
        failures.push(item);
        if (item.critical) criticalFails.push(item);
      }
    }
  }
  const total = passed + failed;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  let verdict: Verdict;
  if (criticalFails.length > 0) {
    verdict = {
      label: "Walk away",
      tone: "bad",
      detail: `${criticalFails.length} critical item(s) failed. The cost of fixing what's likely wrong outweighs any deal you'd get on the bike.`,
    };
  } else if (pct < 70) {
    verdict = {
      label: "Negotiate hard or walk",
      tone: "bad",
      detail:
        "Multiple non-critical fails stack up. Either the price reflects the work needed, or this bike isn't your one.",
    };
  } else if (pct < 85) {
    verdict = {
      label: "Negotiate",
      tone: "warn",
      detail:
        "A few items need attention. Use the failures below as concrete reasons to reduce the price.",
    };
  } else {
    verdict = {
      label: "Looks good",
      tone: "ok",
      detail:
        "Solid bike on this checklist. Pay a fair price and ride it home.",
    };
  }
  return { passed, failed, total, pct, criticalFails, failures, verdict };
}

export default async function InspectionChecklistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const answers: Record<string, Answer> = {};
  for (const cat of CATEGORIES) {
    for (const item of cat.items) {
      const v = params[item.id];
      if (v === "pass" || v === "fail") answers[item.id] = v;
    }
  }
  const submitted = Object.keys(answers).length > 0;
  const report = submitted ? evaluate(answers) : null;

  return (
    <div className="page page--pad" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Link
        href="/tools"
        style={{
          color: "var(--ink-3)",
          fontSize: "var(--t-body-s)",
          textDecoration: "none",
        }}
      >
        ← All tools
      </Link>

      <header style={{ margin: "var(--s-5) 0 var(--s-7)" }}>
        <p className="eyebrow" style={{ margin: 0 }}>
          Inspection checklist
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-h1)",
            color: "var(--ink-1)",
            margin: "var(--s-2) 0 var(--s-3)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          Pre-purchase inspection
        </h1>
        <p style={{ color: "var(--ink-2)", margin: 0, lineHeight: 1.5 }}>
          22 checks across the things that actually matter on a used eBike.
          Fill it in at the meet-up — or before, on a long-tail listing — and
          get a buy/walk verdict at the end.
        </p>
      </header>

      {report && <ReportPanel report={report} />}

      <form method="get">
        {CATEGORIES.map((cat) => (
          <section
            key={cat.name}
            className="form-card"
            style={{ marginBottom: "var(--s-4)" }}
          >
            <h2 className="card-heading" style={{ margin: 0 }}>
              {cat.name}
            </h2>
            <p className="card-sub" style={{ marginTop: 4 }}>
              {cat.description}
            </p>
            <ul
              style={{
                marginTop: "var(--s-3)",
                marginBottom: 0,
                padding: 0,
                listStyle: "none",
              }}
            >
              {cat.items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  selected={answers[item.id]}
                />
              ))}
            </ul>
          </section>
        ))}

        <div
          style={{
            display: "flex",
            gap: "var(--s-3)",
            marginTop: "var(--s-5)",
            flexWrap: "wrap",
          }}
        >
          <button type="submit" className="btn --primary">
            Score this inspection
          </button>
          <Link href="/tools/inspection-checklist" className="btn --ghost">
            Reset
          </Link>
        </div>
      </form>
    </div>
  );
}

function ChecklistRow({
  item,
  selected,
}: {
  item: Item;
  selected: Answer | undefined;
}) {
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "var(--s-3)",
        alignItems: "flex-start",
        padding: "var(--s-3) 0",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              color: "var(--ink-1)",
              fontSize: "var(--t-body)",
            }}
          >
            {item.label}
          </span>
          {item.critical && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#a01818",
                fontWeight: 700,
                background: "#fff2f2",
                border: "1px solid #f5c2c2",
                padding: "1px 6px",
                borderRadius: 999,
              }}
            >
              critical
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            marginTop: 2,
            lineHeight: 1.5,
          }}
        >
          {item.hint}
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label={item.label}
        style={{
          display: "flex",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <RadioPill
          name={item.id}
          value="pass"
          label="Pass"
          checked={selected === "pass"}
          tone="ok"
        />
        <RadioPill
          name={item.id}
          value="fail"
          label="Fail"
          checked={selected === "fail"}
          tone="bad"
        />
      </div>
    </li>
  );
}

function RadioPill({
  name,
  value,
  label,
  checked,
  tone,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  tone: "ok" | "bad";
}) {
  const accent =
    tone === "ok"
      ? checked
        ? { bg: "var(--volt-50)", border: "var(--volt-300)", color: "var(--ink-1)" }
        : { bg: "#fff", border: "var(--hairline)", color: "var(--ink-3)" }
      : checked
        ? { bg: "#fff2f2", border: "#f5c2c2", color: "#a01818" }
        : { bg: "#fff", border: "var(--hairline)", color: "var(--ink-3)" };
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        background: accent.bg,
        border: `1px solid ${accent.border}`,
        borderRadius: 999,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        color: accent.color,
        whiteSpace: "nowrap",
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
      />
      {label}
    </label>
  );
}

function ReportPanel({ report }: { report: ReturnType<typeof evaluate> }) {
  const tone =
    report.verdict.tone === "ok"
      ? { bg: "var(--volt-50)", border: "var(--volt-300)" }
      : report.verdict.tone === "warn"
        ? { bg: "#fff7e6", border: "#f5d188" }
        : { bg: "#fff2f2", border: "#f5c2c2" };
  return (
    <section
      style={{
        marginBottom: "var(--s-5)",
        padding: "var(--s-5)",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 12,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        Verdict
      </p>
      <h2
        style={{
          margin: "var(--s-2) 0",
          fontSize: 32,
          color: "var(--ink-1)",
          letterSpacing: "-0.02em",
        }}
      >
        {report.verdict.label}
      </h2>
      <p
        style={{
          margin: 0,
          color: "var(--ink-2)",
          fontSize: 15,
          lineHeight: 1.5,
        }}
      >
        {report.verdict.detail}
      </p>

      <div
        style={{
          display: "flex",
          gap: "var(--s-4)",
          marginTop: "var(--s-4)",
          flexWrap: "wrap",
        }}
      >
        <ScoreCell
          label="Score"
          value={`${report.passed}/${report.total}`}
          sub={`${report.pct}% pass`}
        />
        <ScoreCell label="Failed" value={String(report.failed)} sub="items" />
        <ScoreCell
          label="Critical fails"
          value={String(report.criticalFails.length)}
          sub="must-haves"
        />
      </div>

      {report.failures.length > 0 && (
        <div style={{ marginTop: "var(--s-4)" }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              marginBottom: 6,
            }}
          >
            Use these as negotiation leverage
          </p>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {report.failures.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "flex-start",
                  fontSize: 14,
                  color: "var(--ink-2)",
                  lineHeight: 1.5,
                }}
              >
                <span aria-hidden style={{ color: "#a01818", fontWeight: 700 }}>
                  ✗
                </span>
                <span>
                  <strong>{item.label}</strong>
                  {item.critical && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                        color: "#a01818",
                      }}
                    >
                      critical
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ScoreCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--ink-1)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

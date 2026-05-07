"use client";

import { useEffect, useState } from "react";

/**
 * Narrow amber bar that appears above the topbar whenever a
 * maintenance window is scheduled (countdown) or active (admin still
 * working). Counts down to maintenance_at every second; when the
 * timestamp passes, swaps copy from 'starts in N' to 'in progress'.
 *
 * Doesn't perform the actual gate — that lives in the layout, which
 * checks settings.maintenanceAt server-side and renders the
 * MaintenancePage to non-admin users when it's elapsed. The banner is
 * just the visible 'something's coming' / 'something's happening'
 * signal.
 */
export function MaintenanceBanner({
  targetIso,
  forAdmin,
}: {
  targetIso: string;
  /** Banner copy adapts: admins see 'Maintenance is on for users…'
   *  while regular users (in the countdown phase only) see 'Site
   *  enters maintenance in…'. */
  forAdmin: boolean;
}) {
  const targetMs = new Date(targetIso).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remainingMs = targetMs - now;
  const active = remainingMs <= 0;

  let text: string;
  if (active) {
    text = forAdmin
      ? "Maintenance is on for non-admin users. They see the maintenance page; you keep working."
      : "Maintenance is in progress. The site will be back shortly.";
  } else {
    text = `${forAdmin ? "Maintenance starts" : "Site enters maintenance"} in ${formatRemaining(
      remainingMs,
    )}`;
  }

  return (
    <div
      style={{
        background: active ? "#1c1816" : "#fef3c7",
        color: active ? "#fff" : "#92400e",
        borderBottom: active ? "1px solid #1c1816" : "1px solid #fcd34d",
        padding: "6px 16px",
        textAlign: "center",
        fontSize: 13,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.04em",
      }}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

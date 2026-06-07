import { requireAdmin } from "@/lib/auth";
import { listApplications } from "@/lib/partner-programme";
import { getSandboxesByUser } from "@/lib/partner-sandbox";
import {
  approveApplication,
  deleteApplication,
  rejectApplication,
} from "@/lib/actions/admin-partner-applications";
import { endSandbox, startSandbox } from "@/lib/actions/admin-sandbox";
import { Badge, Button, Input } from "../../_components/ui";
import { ConfirmSubmit } from "../../_components/confirm-submit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner applications — Admin" };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const cellHead: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--s-2) var(--s-3)",
  fontSize: 12,
  color: "var(--ink-3)",
  borderBottom: "1px solid var(--hairline)",
  whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  padding: "var(--s-3)",
  fontSize: "var(--t-body-s)",
  borderBottom: "1px solid var(--hairline)",
  verticalAlign: "top",
};

function statusBadge(status: string) {
  if (status === "approved") return <Badge variant="ok">Approved</Badge>;
  if (status === "rejected") return <Badge variant="warn">Rejected</Badge>;
  return <Badge variant="info">Pending</Badge>;
}

const NOTES: Record<string, string> = {
  approved: "Application approved — partner activated.",
  rejected: "Application rejected.",
  deleted: "Application deleted.",
  "sandbox-started":
    "Sandbox created — the applicant can trial the partner tools and browse their private test region.",
  "sandbox-ended": "Sandbox removed.",
};
const ERRORS: Record<string, string> = {
  taken: "That region was already granted to another partner. Reject this application instead.",
  approve: "Couldn’t approve — the application may have already been decided.",
  "sandbox-exists": "That applicant already has a sandbox.",
  "sandbox-failed": "Couldn’t create the sandbox — please try again.",
};

export default async function PartnerApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { done, error } = await searchParams;
  const [apps, sandboxes] = await Promise.all([
    listApplications(),
    getSandboxesByUser(),
  ]);
  const pendingCount = apps.filter((a) => a.status === "pending").length;
  const doneMessage = done ? NOTES[done] ?? null : null;
  const errorMessage = error ? ERRORS[error] ?? "Something went wrong." : null;

  return (
    <div className="page admin-page" style={{ maxWidth: 1180 }}>
      <header className="admin-header">
        <p className="eyebrow">Admin · Partner applications</p>
        <h1>Partner applications</h1>
        <p className="sub">
          {pendingCount} pending · {apps.length} total. Approving grants the
          region, flags the user as a partner, and starts their 12-month free
          window.
        </p>
      </header>

      {doneMessage && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          {doneMessage}
        </p>
      )}
      {errorMessage && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          {errorMessage}
        </p>
      )}

      <section className="form-card">
        {apps.length === 0 ? (
          <p className="card-sub" style={{ margin: 0 }}>
            No partner applications yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  {["Region", "Applicant", "Submitted", "Status", "Sandbox", "Actions"].map(
                    (h) => (
                      <th key={h} style={cellHead}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => {
                  const isPending = a.status === "pending";
                  const sb = sandboxes[a.user_id];
                  const hasDetail =
                    !!a.business_name || !!a.pitch || !!a.expected_inventory;
                  return (
                    <tr key={a.id}>
                      {/* Region */}
                      <td style={cell}>
                        <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>
                          {a.region_label}
                        </div>
                        {a.region_taken && (
                          <div style={{ marginTop: 4 }}>
                            <Badge variant="warn">
                              Taken
                              {a.region_owner_email ? ` · ${a.region_owner_email}` : ""}
                            </Badge>
                          </div>
                        )}
                      </td>

                      {/* Applicant + expandable detail */}
                      <td style={{ ...cell, minWidth: 220 }}>
                        <div style={{ color: "var(--ink-1)" }}>{a.user_email}</div>
                        {a.business_name && (
                          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                            {a.business_name}
                          </div>
                        )}
                        {hasDetail && (
                          <details style={{ marginTop: 6 }}>
                            <summary
                              style={{
                                cursor: "pointer",
                                fontSize: 12,
                                color: "var(--volt-700)",
                                fontWeight: 600,
                              }}
                            >
                              Details
                            </summary>
                            <div style={{ marginTop: 6, color: "var(--ink-2)" }}>
                              {a.pitch && (
                                <p style={{ margin: "0 0 4px" }}>
                                  <strong style={{ color: "var(--ink-1)" }}>Pitch:</strong>{" "}
                                  {a.pitch}
                                </p>
                              )}
                              {a.expected_inventory && (
                                <p style={{ margin: 0 }}>
                                  <strong style={{ color: "var(--ink-1)" }}>
                                    Inventory:
                                  </strong>{" "}
                                  {a.expected_inventory}
                                </p>
                              )}
                            </div>
                          </details>
                        )}
                      </td>

                      {/* Submitted / decided */}
                      <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--ink-3)" }}>
                        {fmtDate(a.created_at)}
                        {a.decided_at && (
                          <div style={{ fontSize: 11, marginTop: 2 }}>
                            decided {fmtDate(a.decided_at)}
                          </div>
                        )}
                      </td>

                      {/* Status + decision note */}
                      <td style={cell}>
                        {statusBadge(a.status)}
                        {a.decision_note && (
                          <div
                            style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, maxWidth: 200 }}
                          >
                            {a.decision_note}
                          </div>
                        )}
                      </td>

                      {/* Sandbox */}
                      <td style={cell}>
                        {sb ? (
                          <div
                            style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}
                          >
                            <Badge variant="info">
                              Active · {sb.listings}
                            </Badge>
                            <form action={endSandbox}>
                              <input type="hidden" name="region_id" value={sb.regionId} />
                              <Button type="submit" variant="ghost" size="sm">
                                End
                              </Button>
                            </form>
                          </div>
                        ) : isPending ? (
                          <form action={startSandbox}>
                            <input type="hidden" name="application_id" value={a.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Start
                            </Button>
                          </form>
                        ) : (
                          <span style={{ color: "var(--ink-4)" }}>—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ ...cell, minWidth: 200 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {isPending && (
                            <>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <form action={approveApplication}>
                                  <input type="hidden" name="id" value={a.id} />
                                  <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    disabled={a.region_taken}
                                  >
                                    Approve
                                  </Button>
                                </form>
                              </div>
                              <form
                                action={rejectApplication}
                                style={{ display: "flex", gap: 6, alignItems: "center" }}
                              >
                                <input type="hidden" name="id" value={a.id} />
                                <Input
                                  name="note"
                                  maxLength={500}
                                  placeholder="Reason (optional)"
                                  style={{ maxWidth: 150, fontSize: 12 }}
                                />
                                <Button type="submit" variant="ghost" size="sm">
                                  Reject
                                </Button>
                              </form>
                            </>
                          )}
                          <form action={deleteApplication}>
                            <input type="hidden" name="id" value={a.id} />
                            <ConfirmSubmit
                              message="Delete this application permanently? This can't be undone."
                            >
                              Delete
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

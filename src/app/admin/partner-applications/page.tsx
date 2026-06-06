import { requireAdmin } from "@/lib/auth";
import { listApplications } from "@/lib/partner-programme";
import { getSandboxesByUser } from "@/lib/partner-sandbox";
import {
  approveApplication,
  rejectApplication,
} from "@/lib/actions/admin-partner-applications";
import { endSandbox, startSandbox } from "@/lib/actions/admin-sandbox";
import { Badge, Button, Input } from "../../_components/ui";

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
  const pending = apps.filter((a) => a.status === "pending");
  const decided = apps.filter((a) => a.status !== "pending");

  return (
    <div className="page page--pad" style={{ maxWidth: 1000 }}>
      <header style={{ marginBottom: "var(--s-5)" }}>
        <h1>Partner applications</h1>
        <p className="sub">
          Review applications to run a region. Approving grants the region,
          flags the user as a partner, and starts their 12-month free window.
        </p>
      </header>

      {done === "approved" && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          Application approved — partner activated.
        </p>
      )}
      {done === "rejected" && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          Application rejected.
        </p>
      )}
      {error === "taken" && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          That region was already granted to another partner. Reject this
          application instead.
        </p>
      )}
      {error === "approve" && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          Couldn&rsquo;t approve — the application may have already been decided.
        </p>
      )}
      {done === "sandbox-started" && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          Sandbox created — the applicant can now trial the partner tools and
          browse their private test region.
        </p>
      )}
      {done === "sandbox-ended" && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          Sandbox removed.
        </p>
      )}
      {error === "sandbox-exists" && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          That applicant already has a sandbox.
        </p>
      )}
      {error === "sandbox-failed" && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          Couldn&rsquo;t create the sandbox — please try again.
        </p>
      )}

      <h2 className="card-heading">Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="card-sub" style={{ marginBottom: "var(--s-6)" }}>
          No applications waiting for review.
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-4)",
            marginBottom: "var(--s-7)",
          }}
        >
          {pending.map((a) => (
            <div key={a.id} className="form-card" style={{ padding: "var(--s-5)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--s-3)",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, color: "var(--ink-1)" }}>
                    {a.region_label}
                  </h3>
                  <p className="card-sub" style={{ margin: "2px 0 0" }}>
                    {a.user_email} · applied {fmtDate(a.created_at)}
                  </p>
                </div>
                {a.region_taken && (
                  <Badge variant="warn">
                    Region taken{a.region_owner_email ? ` · ${a.region_owner_email}` : ""}
                  </Badge>
                )}
              </div>

              {(a.business_name || a.pitch || a.expected_inventory) && (
                <dl style={{ margin: "var(--s-3) 0 0", fontSize: "var(--t-body-s)" }}>
                  {a.business_name && (
                    <p style={{ margin: "0 0 4px" }}>
                      <strong>Business:</strong> {a.business_name}
                    </p>
                  )}
                  {a.pitch && (
                    <p style={{ margin: "0 0 4px", color: "var(--ink-2)" }}>
                      <strong style={{ color: "var(--ink-1)" }}>Pitch:</strong>{" "}
                      {a.pitch}
                    </p>
                  )}
                  {a.expected_inventory && (
                    <p style={{ margin: 0, color: "var(--ink-2)" }}>
                      <strong style={{ color: "var(--ink-1)" }}>Inventory:</strong>{" "}
                      {a.expected_inventory}
                    </p>
                  )}
                </dl>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "var(--s-3)",
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                  marginTop: "var(--s-4)",
                }}
              >
                <form
                  action={approveApplication}
                  style={{ display: "flex", gap: "var(--s-2)", alignItems: "flex-end" }}
                >
                  <input type="hidden" name="id" value={a.id} />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={a.region_taken}
                  >
                    Approve &amp; activate
                  </Button>
                </form>
                <form
                  action={rejectApplication}
                  style={{ display: "flex", gap: "var(--s-2)", alignItems: "flex-end", flex: "1 1 280px" }}
                >
                  <input type="hidden" name="id" value={a.id} />
                  <label style={{ flex: 1, fontSize: 12, color: "var(--ink-3)" }}>
                    Reason (optional, sent to applicant)
                    <Input name="note" maxLength={500} />
                  </label>
                  <Button type="submit" variant="ghost" size="sm">
                    Reject
                  </Button>
                </form>
              </div>

              {(() => {
                const sb = sandboxes[a.user_id];
                return (
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--s-3)",
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginTop: "var(--s-4)",
                      paddingTop: "var(--s-3)",
                      borderTop: "1px dashed var(--hairline)",
                    }}
                  >
                    {sb ? (
                      <>
                        <Badge variant="info">
                          Sandbox active · {sb.listings} listing
                          {sb.listings === 1 ? "" : "s"}
                        </Badge>
                        <form action={endSandbox}>
                          <input type="hidden" name="region_id" value={sb.regionId} />
                          <Button type="submit" variant="ghost" size="sm">
                            End sandbox
                          </Button>
                        </form>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          Let them trial the partner tools in a private test
                          region before you decide.
                        </span>
                        <form action={startSandbox}>
                          <input type="hidden" name="application_id" value={a.id} />
                          <Button type="submit" variant="dark" size="sm">
                            Start a sandbox
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="card-heading">Decided</h2>
          <div className="form-card">
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {decided.map((a) => (
                <li
                  key={a.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--s-3)",
                    alignItems: "center",
                    padding: "var(--s-3) 0",
                    borderBottom: "1px solid var(--hairline)",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--ink-1)" }}>
                      {a.region_label}
                    </span>{" "}
                    <span style={{ color: "var(--ink-3)", fontSize: 13 }}>
                      · {a.user_email}
                      {a.decided_at ? ` · ${fmtDate(a.decided_at)}` : ""}
                    </span>
                    {a.decision_note && (
                      <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                        {a.decision_note}
                      </div>
                    )}
                  </div>
                  {a.status === "approved" ? (
                    <Badge variant="ok">Approved</Badge>
                  ) : (
                    <Badge variant="warn">Rejected</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

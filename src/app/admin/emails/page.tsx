import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  extractLinks,
  getCapturedEmail,
  listCapturedEmails,
} from "@/lib/captured-emails";
import {
  clearCapturedEmails,
  deleteCapturedEmail,
} from "@/lib/actions/admin-emails";
import { Button } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Captured Emails — Admin" };

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function CapturedEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireAdmin();
  const { id } = await searchParams;

  const list = await listCapturedEmails(100);
  const selectedId = id ?? list[0]?.id ?? null;
  const selected = selectedId ? await getCapturedEmail(selectedId) : null;
  const links = selected ? extractLinks(selected.html) : [];

  return (
    <div className="page page--pad">
      <header style={{ marginBottom: "var(--s-5)" }}>
        <h1>Captured Emails</h1>
        <p className="sub">
          Outbound email captured locally (when the app runs with{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            EMAIL_CAPTURE=1
          </code>
          ) instead of being sent via Resend. Links point at this local
          server, so you can click them to action the flow.
        </p>
      </header>

      {list.length === 0 ? (
        <div className="form-card">
          <p className="card-sub" style={{ margin: 0 }}>
            No captured emails yet. Trigger one (register, reset password,
            send a message…) while running locally with{" "}
            <code>EMAIL_CAPTURE=1</code>.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px, 320px) 1fr",
            gap: "var(--s-5)",
            alignItems: "start",
          }}
        >
          {/* Inbox list */}
          <div className="form-card" style={{ padding: "var(--s-3)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0 var(--s-2) var(--s-2)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                {list.length} message{list.length === 1 ? "" : "s"}
              </span>
              <form action={clearCapturedEmails}>
                <button
                  type="submit"
                  style={{
                    border: 0,
                    background: "none",
                    color: "var(--volt-700)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Clear inbox
                </button>
              </form>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {list.map((m) => {
                const active = m.id === selectedId;
                return (
                  <li key={m.id}>
                    <Link
                      href={`/admin/emails?id=${m.id}`}
                      style={{
                        display: "block",
                        padding: "var(--s-3)",
                        borderRadius: 8,
                        textDecoration: "none",
                        color: "inherit",
                        background: active ? "var(--surface-sunken)" : "transparent",
                        border: active
                          ? "1px solid var(--hairline)"
                          : "1px solid transparent",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--ink-1)",
                          fontSize: "var(--t-body-s)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.subject}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        {m.to_email}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                        {fmtWhen(m.created_at)}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Selected message */}
          <div className="form-card">
            {!selected ? (
              <p className="card-sub">Select a message.</p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--s-4)",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2 className="card-heading" style={{ margin: 0 }}>
                      {selected.subject}
                    </h2>
                    <p className="card-sub" style={{ margin: "2px 0 0" }}>
                      To {selected.to_email} · {fmtWhen(selected.created_at)}
                    </p>
                  </div>
                  <form action={deleteCapturedEmail}>
                    <input type="hidden" name="id" value={selected.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>

                {links.length > 0 && (
                  <div
                    style={{
                      marginTop: "var(--s-4)",
                      padding: "var(--s-3) var(--s-4)",
                      background: "var(--volt-50)",
                      border: "1px solid var(--volt-100)",
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--volt-700)",
                        marginBottom: 6,
                      }}
                    >
                      Links in this email
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                      {links.map((href) => (
                        <li key={href} style={{ marginBottom: 4 }}>
                          <a
                            href={href}
                            style={{
                              color: "var(--ink-1)",
                              fontSize: "var(--t-body-s)",
                              wordBreak: "break-all",
                            }}
                          >
                            {href}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ marginTop: "var(--s-4)" }}>
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={selected.html ?? "<em>(no HTML body)</em>"}
                    style={{
                      width: "100%",
                      height: 520,
                      border: "1px solid var(--hairline)",
                      borderRadius: 10,
                      background: "#fff",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

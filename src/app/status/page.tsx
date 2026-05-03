import os from "node:os";
import { query, getPoolStats } from "@/lib/db";
import { pingAnthropic } from "@/lib/anthropic";
import { buildInfo } from "@/lib/build-info";

export const dynamic = "force-dynamic";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function pingDatabase(): Promise<number> {
  const t0 = Date.now();
  await query("SELECT 1");
  return Date.now() - t0;
}

type ServerInfo = {
  version: string;
  database: string;
  user: string;
  host: string | null;
  port: number | null;
  started_at: string;
  now: string;
  size: string;
  max_connections: string;
};

async function getServerInfo() {
  const r = await query<ServerInfo>(`
    SELECT
      version() AS version,
      current_database() AS database,
      current_user AS "user",
      inet_server_addr()::text AS host,
      inet_server_port() AS port,
      pg_postmaster_start_time()::text AS started_at,
      NOW()::text AS now,
      pg_size_pretty(pg_database_size(current_database())) AS size,
      current_setting('max_connections') AS max_connections
  `);
  return r.rows[0];
}

async function getActiveConnections() {
  const r = await query<{ active: string }>(
    `SELECT count(*)::text AS active FROM pg_stat_activity WHERE datname = current_database()`,
  );
  return Number(r.rows[0]?.active ?? 0);
}

async function getCounts() {
  const r = await query<{
    users: string;
    sessions: string;
    active_sessions: string;
    listings: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM users)::text AS users,
      (SELECT COUNT(*) FROM sessions)::text AS sessions,
      (SELECT COUNT(*) FROM sessions WHERE expires_at > NOW())::text AS active_sessions,
      (SELECT COUNT(*) FROM listings)::text AS listings
  `);
  return r.rows[0];
}

async function getLatest() {
  const r = await query<{
    last_user: string | null;
    last_listing: string | null;
  }>(`
    SELECT
      (SELECT MAX(created_at)::text FROM users)    AS last_user,
      (SELECT MAX(created_at)::text FROM listings) AS last_listing
  `);
  return r.rows[0];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  } catch {
    return s;
  }
}

function shortVersion(v: string): string {
  // "PostgreSQL 14.10 on x86_64-pc-linux-gnu, ..." → "PostgreSQL 14.10"
  const idx = v.indexOf(" on ");
  return idx > 0 ? v.slice(0, idx) : v;
}

export default async function StatusPage() {
  const [latency, serverInfo, activeConns, counts, latest, anthropic] =
    await Promise.all([
      safe(pingDatabase),
      safe(getServerInfo),
      safe(getActiveConnections),
      safe(getCounts),
      safe(getLatest),
      safe(() => pingAnthropic()),
    ]);

  const pool = getPoolStats();
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = process.uptime();
  const loadavg = os.loadavg();

  const railway = {
    env: process.env.RAILWAY_ENVIRONMENT_NAME,
    project: process.env.RAILWAY_PROJECT_NAME,
    service: process.env.RAILWAY_SERVICE_NAME,
    replica: process.env.RAILWAY_REPLICA_ID,
    deployment: process.env.RAILWAY_DEPLOYMENT_ID,
    region: process.env.RAILWAY_REGION,
    branch: process.env.RAILWAY_GIT_BRANCH,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA,
    author: process.env.RAILWAY_GIT_AUTHOR,
  };
  const hasRailway = Boolean(railway.env || railway.service || railway.project);

  const dbOk = latency.ok;
  const dbLatency = latency.ok ? `${latency.value} ms` : "—";
  const anthropicOk = anthropic.ok;
  const anthropicLatency = anthropic.ok ? `${anthropic.value.latencyMs} ms` : "—";

  return (
    <div className="page status-page">
      <header className="status-header">
        <p className="eyebrow">System Status</p>
        <h1>Backend dashboard</h1>
        <p className="sub">
          Live snapshot of the Postgres database, Node runtime, and hosting
          environment.
        </p>
      </header>

      <section className="kpi-row">
        <KPI
          label="Database"
          value={dbOk ? "Live" : "Down"}
          tone={dbOk ? "ok" : "err"}
        />
        <KPI label="DB latency" value={dbLatency} />
        <KPI
          label="Claude API"
          value={anthropicOk ? "Live" : "Down"}
          tone={anthropicOk ? "ok" : "err"}
        />
        <KPI
          label="Listings"
          value={counts.ok ? counts.value.listings : "—"}
        />
        <KPI label="Users" value={counts.ok ? counts.value.users : "—"} />
        <KPI
          label="Active sessions"
          value={counts.ok ? counts.value.active_sessions : "—"}
        />
        <KPI label="Process uptime" value={formatDuration(uptime)} />
      </section>

      <div className="dashboard-grid">
        <DetailCard title="Database server">
          {serverInfo.ok ? (
            <KVList>
              <KV k="Version" v={shortVersion(serverInfo.value.version)} />
              <KV k="Database" v={serverInfo.value.database} />
              <KV k="User" v={serverInfo.value.user} />
              <KV k="Host" v={serverInfo.value.host ?? "(unix socket)"} />
              <KV k="Port" v={serverInfo.value.port ?? "—"} />
              <KV k="Size" v={serverInfo.value.size} />
              <KV
                k="Started"
                v={formatTime(serverInfo.value.started_at)}
              />
              <KV k="Server time" v={formatTime(serverInfo.value.now)} />
            </KVList>
          ) : (
            <ErrLine msg={serverInfo.error} />
          )}
        </DetailCard>

        <DetailCard title="Connections">
          <KVList>
            <KV
              k="Server-side"
              v={
                activeConns.ok && serverInfo.ok
                  ? `${activeConns.value} / ${serverInfo.value.max_connections}`
                  : activeConns.ok
                    ? String(activeConns.value)
                    : "—"
              }
            />
            <KV k="Pool — total" v={pool.total} />
            <KV k="Pool — idle" v={pool.idle} />
            <KV k="Pool — waiting" v={pool.waiting} />
            <KV k="Round-trip" v={dbLatency} />
            <KV
              k="SSL"
              v={process.env.DATABASE_SSL === "true" ? "Enabled" : "Disabled"}
            />
          </KVList>
        </DetailCard>

        <DetailCard title="Tables">
          {counts.ok ? (
            <KVList>
              <KV k="users" v={counts.value.users} />
              <KV k="listings" v={counts.value.listings} />
              <KV
                k="sessions"
                v={`${counts.value.sessions} (${counts.value.active_sessions} active)`}
              />
            </KVList>
          ) : (
            <ErrLine msg={counts.error} />
          )}
        </DetailCard>

        <DetailCard title="Claude API">
          {anthropic.ok ? (
            <KVList>
              <KV k="Status" v="Live" />
              <KV k="Round-trip" v={anthropicLatency} />
              <KV k="Model" v={anthropic.value.model} />
              <KV
                k="API key"
                v={anthropic.value.keyConfigured ? "Configured" : "Missing"}
              />
            </KVList>
          ) : (
            <>
              <KVList>
                <KV
                  k="API key"
                  v={process.env.ANTHROPIC_API_KEY ? "Configured" : "Missing"}
                />
              </KVList>
              <ErrLine msg={anthropic.error} />
            </>
          )}
        </DetailCard>

        <DetailCard title="Latest activity">
          {latest.ok ? (
            <KVList>
              <KV k="Last user signup" v={formatTime(latest.value.last_user)} />
              <KV
                k="Last listing"
                v={formatTime(latest.value.last_listing)}
              />
            </KVList>
          ) : (
            <ErrLine msg={latest.error} />
          )}
        </DetailCard>

        <DetailCard title="Runtime">
          <KVList>
            <KV k="Node" v={process.version} />
            <KV k="Platform" v={`${process.platform} / ${process.arch}`} />
            <KV k="Hostname" v={os.hostname()} />
            <KV k="CPUs" v={os.cpus().length} />
            <KV k="Process uptime" v={formatDuration(uptime)} />
            <KV
              k="System memory"
              v={`${formatBytes(totalMem - freeMem)} / ${formatBytes(totalMem)}`}
            />
            <KV k="RSS" v={formatBytes(mem.rss)} />
            <KV
              k="Heap"
              v={`${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`}
            />
            {process.platform !== "win32" && (
              <KV
                k="Load avg"
                v={loadavg.map((l) => l.toFixed(2)).join(" / ")}
              />
            )}
          </KVList>
        </DetailCard>

        <DetailCard title="Build">
          <KVList>
            <KV k="Version" v={`v${buildInfo.version}`} />
            <KV
              k="Commit"
              v={
                buildInfo.commitFull === "unknown"
                  ? "unknown"
                  : buildInfo.commit
              }
            />
            <KV k="Node engine" v=">=20.0.0" />
            <KV k="NODE_ENV" v={process.env.NODE_ENV ?? "—"} />
          </KVList>
        </DetailCard>

        {hasRailway && (
          <DetailCard title="Hosting · Railway">
            <KVList>
              <KV k="Environment" v={railway.env ?? "—"} />
              <KV k="Project" v={railway.project ?? "—"} />
              <KV k="Service" v={railway.service ?? "—"} />
              <KV k="Region" v={railway.region ?? "—"} />
              <KV k="Replica" v={railway.replica ?? "—"} />
              <KV k="Deployment" v={railway.deployment ?? "—"} />
              <KV k="Branch" v={railway.branch ?? "—"} />
              <KV
                k="Deploy commit"
                v={railway.commit ? railway.commit.slice(0, 7) : "—"}
              />
              <KV k="Author" v={railway.author ?? "—"} />
            </KVList>
          </DetailCard>
        )}
      </div>

      <footer className="status-footer">
        <span>Refreshes on page load.</span>
        <span aria-hidden> · </span>
        <a href="/api/health">JSON · /api/health</a>
      </footer>
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "err";
}) {
  return (
    <div className={`kpi ${tone ? `--${tone}` : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="detail-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function KVList({ children }: { children: React.ReactNode }) {
  return <dl className="kv-list">{children}</dl>;
}

function KV({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function ErrLine({ msg }: { msg: string }) {
  return <div className="kv-error">{msg}</div>;
}

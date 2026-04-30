import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { REF_TABLES } from "@/lib/ref-data";

export const dynamic = "force-dynamic";

export default async function ReferenceDataIndex() {
  await requireAdmin();

  const counts = await Promise.all(
    REF_TABLES.map(async (t) => {
      try {
        const r = await query<{ total: string; active: string }>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE is_active)::text AS active
             FROM ${t.table}`,
        );
        return {
          key: t.key,
          total: Number(r.rows[0]?.total ?? 0),
          active: Number(r.rows[0]?.active ?? 0),
        };
      } catch {
        return { key: t.key, total: 0, active: 0 };
      }
    }),
  );
  const counted = Object.fromEntries(counts.map((c) => [c.key, c]));

  return (
    <div className="page admin-page">
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Reference data</p>
        <h1>Manage Reference Data</h1>
        <p className="sub">
          Curated lookup values used across listings. Add, rename, reorder, or
          deactivate any value.
        </p>
      </header>

      <ul className="admin-list">
        {REF_TABLES.map((t) => {
          const c = counted[t.key];
          return (
            <li key={t.key}>
              <Link
                href={`/admin/reference-data/${t.key}`}
                className="admin-tile"
              >
                <div className="admin-tile-body">
                  <div className="admin-tile-title">{t.label}</div>
                  <div className="admin-tile-desc">
                    {c.active} active · {c.total} total
                  </div>
                </div>
                <span className="admin-tile-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

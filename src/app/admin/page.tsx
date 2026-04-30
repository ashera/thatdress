import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ADMIN_LINKS: Array<{ href: string; title: string; desc: string }> = [
  {
    href: "/admin/reference-data",
    title: "Manage Reference Data",
    desc: "Edit shared lookup values used across the app.",
  },
  {
    href: "/admin/regions",
    title: "Manage Regions",
    desc: "Configure which geographical regions the site is available in.",
  },
];

export default async function AdminHomePage() {
  await requireAdmin();

  return (
    <div className="page admin-page">
      <header className="admin-header">
        <p className="eyebrow">Admin</p>
        <h1>Admin console</h1>
        <p className="sub">Tools for managing the marketplace.</p>
      </header>

      <ul className="admin-list">
        {ADMIN_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="admin-tile">
              <div className="admin-tile-body">
                <div className="admin-tile-title">{l.title}</div>
                <div className="admin-tile-desc">{l.desc}</div>
              </div>
              <span className="admin-tile-arrow" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

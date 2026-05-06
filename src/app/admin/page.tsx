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
  {
    href: "/admin/users",
    title: "Manage Users",
    desc: "View accounts, edit profiles, suspend, and DM users directly.",
  },
  {
    href: "/admin/tickets",
    title: "Support Tickets",
    desc: "Triage open tickets and reply to users.",
  },
  {
    href: "/admin/blog",
    title: "Blog Management",
    desc: "Write articles to attract visitors and support SEO.",
  },
  {
    href: "/admin/listings",
    title: "All Listings",
    desc: "Search, sort, and drill into any listing — see who's messaged the seller and how active each listing is.",
  },
  {
    href: "/admin/listings/flagged",
    title: "Flagged Listings",
    desc: "Review listings flagged for suspect authenticity or accuracy.",
  },
  {
    href: "/admin/site-settings",
    title: "Site Settings",
    desc: "Block crawlers pre-launch, set the Verified-badge threshold, other site-wide switches.",
  },
  {
    href: "/admin/database",
    title: "Database Structure",
    desc: "Tables, descriptions, and current row counts.",
  },
  {
    href: "/admin/docs",
    title: "Project Documentation",
    desc: "Rendered view of README.md — stack, architecture, feature systems, deploy notes.",
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

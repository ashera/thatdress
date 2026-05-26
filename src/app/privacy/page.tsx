import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/email";

export const revalidate = 86400;

// Keep the source of truth in one place so the metadata + the
// visible page heading agree.
const LAST_UPDATED = "13 May 2026";

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const title = "Privacy policy — frockd";
  const description =
    "How frockd collects, uses, stores, and shares your information. Australian Privacy Principles (APP) compliant.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/privacy` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/privacy`,
      title,
      description,
      siteName: "frockd",
    },
    twitter: { card: "summary", title, description },
  };
}

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: "who-we-are", label: "Who we are" },
  { id: "information-we-collect", label: "Information we collect" },
  { id: "how-we-use-it", label: "How we use your information" },
  { id: "sharing", label: "Sharing & third parties" },
  { id: "cookies", label: "Cookies & local storage" },
  { id: "retention", label: "How long we keep your data" },
  { id: "your-rights", label: "Your rights" },
  { id: "security", label: "Security" },
  { id: "children", label: "Children's privacy" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact us" },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 760, margin: "0 auto" }}>
        <header style={{ marginBottom: "var(--s-7)" }}>
          <p className="eyebrow" style={{ margin: 0, color: "var(--ink-3)" }}>
            Legal
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-h1)",
              color: "var(--ink-1)",
              margin: "var(--s-2) 0 var(--s-3)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            Privacy policy
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: "var(--t-body-l)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            How frockd collects, uses, stores, and shares the information
            you give us — and the rights you have to access, correct, or
            delete it.
          </p>
          <p
            style={{
              marginTop: "var(--s-3)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Last updated · {LAST_UPDATED}
          </p>
        </header>

        <nav
          aria-label="On this page"
          style={{
            padding: "var(--s-4) var(--s-5)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--hairline)",
            borderRadius: 12,
            marginBottom: "var(--s-6)",
          }}
        >
          <p
            style={{
              margin: "0 0 var(--s-3)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            On this page
          </p>
          <ol
            style={{
              listStyle: "decimal inside",
              padding: 0,
              margin: 0,
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--ink-2)",
            }}
          >
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  style={{ color: "var(--ink-2)", textDecoration: "underline" }}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="prose">
          <section id="who-we-are">
            <h2>1. Who we are</h2>
            <p>
              frockd is a peer-to-peer marketplace for pre-loved formal
              dresses, operated in Australia and accessed at{" "}
              <a href="https://www.frockd.com.au">www.frockd.com.au</a>.
              When we say &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
              &ldquo;frockd,&rdquo; we mean the operator of the
              marketplace.
            </p>
            <p>
              This policy is written to align with the Australian
              Privacy Principles (APP) under the{" "}
              <em>Privacy Act 1988 (Cth)</em>. It applies to every
              visitor and registered user of the site, anywhere in the
              world.
            </p>
          </section>

          <section id="information-we-collect">
            <h2>2. Information we collect</h2>

            <h3>2.1 Information you give us</h3>
            <ul>
              <li>
                <strong>Account details</strong> — email address (used as
                your username), password (stored only as a salted
                bcrypt hash, never in plain text), optional first name,
                surname, title, town, and postcode.
              </li>
              <li>
                <strong>Body measurements</strong> — optional bust,
                waist, and hips measurements (cm) you enter on your
                profile to power the fit calculator. These are visible
                only to you; we never expose them to sellers, buyers,
                or any third party.
              </li>
              <li>
                <strong>Listings</strong> — photos, designer, model,
                year, measurements of the dress, condition, occasion,
                price, location postcode, and any descriptive text
                you provide.
              </li>
              <li>
                <strong>Messages</strong> — the content of
                conversations you exchange with other users about a
                listing, and direct messages with our admin team.
              </li>
              <li>
                <strong>Sale records and reviews</strong> — when a
                seller marks a listing sold to an attributed buyer, we
                record the buyer-seller pair so the buyer can leave a
                review. Reviews you submit (star rating, body, yes/no
                checks) are public on the seller&rsquo;s profile.
              </li>
            </ul>

            <h3>2.2 Information collected automatically</h3>
            <ul>
              <li>
                <strong>Approximate location</strong> — derived once
                from your IP address (at the city/region level, not a
                precise location) to set your default browse region.
                You can override this at any time via the region picker.
              </li>
              <li>
                <strong>Listing views</strong> — we record which
                listings each visitor opens, identified by a salted
                hash of your IP address (not the IP itself). This
                drives anonymous view counts on listing pages and
                seller dashboards.
              </li>
              <li>
                <strong>Cookies</strong> — see section 5 below.
              </li>
              <li>
                <strong>Standard request logs</strong> — our hosting
                provider records HTTP requests (URL, status code,
                timestamp, anonymised IP) for security and debugging
                purposes.
              </li>
            </ul>

            <h3>2.3 Information from third parties</h3>
            <ul>
              <li>
                <strong>Referrals</strong> — if you arrive via another
                user&rsquo;s referral link, that user&rsquo;s id is
                associated with your account so they receive credit
                for the referral.
              </li>
            </ul>
          </section>

          <section id="how-we-use-it">
            <h2>3. How we use your information</h2>
            <ul>
              <li>
                To operate the marketplace — let you list, browse, buy,
                and message other users.
              </li>
              <li>
                To authenticate you when you sign in and keep your
                session active.
              </li>
              <li>
                To send transactional emails — email verification,
                password reset, new-message notifications, review
                prompts, relist nudges, saved-search digests. We never
                send marketing emails without your explicit consent.
              </li>
              <li>
                To compute private features for you — fit assessments
                against listings, your personal stats, dress provenance.
              </li>
              <li>
                To moderate the platform — investigate buyer reports,
                hide harmful content, suspend accounts that breach our
                terms.
              </li>
              <li>
                To improve frockd — aggregate, de-identified analytics
                on traffic patterns, listing performance, and feature
                usage.
              </li>
              <li>
                To comply with legal obligations — for example,
                responding to a lawful request from Australian
                authorities.
              </li>
            </ul>
            <p>
              We do not sell your personal information. We do not run
              third-party ad networks on the site.
            </p>
          </section>

          <section id="sharing">
            <h2>4. Sharing &amp; third parties</h2>
            <p>
              Some of your information is necessarily handled by service
              providers we use to operate the site. We pick providers
              with strong privacy commitments and only share what each
              actually needs:
            </p>
            <ul>
              <li>
                <strong>Railway</strong> — our hosting and database
                provider. Your data is stored on their managed
                PostgreSQL service.
              </li>
              <li>
                <strong>Resend</strong> — used to send transactional
                emails. They receive the recipient address and the
                email body for each message.
              </li>
              <li>
                <strong>Anthropic</strong> — powers the value estimator
                and blog drafting tool. Anthropic only receives the
                listing details you enter into those tools, not your
                account information.
              </li>
              <li>
                <strong>Pinterest</strong> — when an admin pins one of
                your listings to Pinterest to promote it, the
                listing&rsquo;s photo, title, description, and public
                URL are sent to Pinterest. No buyer information is
                shared.
              </li>
              <li>
                <strong>GeoNames</strong> — open postcode data we
                consume; no personal information is sent.
              </li>
            </ul>
            <p>
              Other users can see information you make public on the
              site: the listings you publish, your seller profile, and
              any reviews you write. We don&rsquo;t expose your email
              address to other users unless you choose to share it via
              the messaging system.
            </p>
            <p>
              We do not transfer personal data to any party outside
              Australia for marketing purposes. Some service providers
              listed above process data in jurisdictions other than
              Australia; we ensure each provides comparable privacy
              protection before integrating.
            </p>
          </section>

          <section id="cookies">
            <h2>5. Cookies &amp; local storage</h2>
            <p>
              We use a small number of first-party cookies. We do not
              use third-party advertising cookies or trackers.
            </p>
            <ul>
              <li>
                <strong>session</strong> — keeps you signed in. Expires
                30 days after your last activity or when you log out.
              </li>
              <li>
                <strong>frockd_ref</strong> — records the referral code
                you arrived with so the inviter gets credit when you
                sign up. Expires 30 days after issue.
              </li>
              <li>
                <strong>anon_loc</strong> — caches the city your IP
                resolves to so we don&rsquo;t re-look-up on every
                request. Plain string, no precise location, expires 30
                days after issue.
              </li>
              <li>
                <strong>frockd_friends_seen</strong> — a small number
                tracking how many of your referred friends had crossed
                the Verified threshold the last time you visited the
                refer page (drives the &ldquo;new conversions&rdquo;
                banner). Expires after 1 year.
              </li>
            </ul>
            <p>
              You can clear all of these from your browser at any time;
              you&rsquo;ll be logged out and lose referral attribution
              until the next link click. The site works fine without
              cookies, though you won&rsquo;t be able to stay signed
              in.
            </p>
          </section>

          <section id="retention">
            <h2>6. How long we keep your data</h2>
            <ul>
              <li>
                <strong>Account data</strong> — kept while your account
                is active. You can request deletion via your profile
                at any time; we&rsquo;ll remove your personal
                information within 30 days of the request.
              </li>
              <li>
                <strong>Listings</strong> — kept indefinitely so the
                dress&rsquo;s ownership history (the
                &ldquo;provenance&rdquo; trail on each dress) remains
                accurate across resales. Listings are anonymised if
                their seller deletes their account.
              </li>
              <li>
                <strong>Messages</strong> — kept while both
                participants&rsquo; accounts exist. Removed when either
                account is deleted.
              </li>
              <li>
                <strong>Verification &amp; reset tokens</strong> —
                deleted automatically when they expire (typically
                within hours of being sent).
              </li>
              <li>
                <strong>Request logs</strong> — retained by our hosting
                provider for the period required for security
                investigations, then deleted.
              </li>
            </ul>
          </section>

          <section id="your-rights">
            <h2>7. Your rights</h2>
            <p>Under Australian privacy law, you have the right to:</p>
            <ul>
              <li>
                Access the personal information we hold about you.
                Most of it is visible on your profile and listings
                pages; if you need the rest, contact us (see section
                11).
              </li>
              <li>
                Correct anything inaccurate. You can edit your profile
                and listings yourself; for anything else, contact us.
              </li>
              <li>
                Request deletion of your account. We&rsquo;ll remove
                your personal information within 30 days, subject to
                any data we&rsquo;re legally required to retain.
              </li>
              <li>
                Make a privacy complaint. We&rsquo;ll respond within
                30 days. If you&rsquo;re not satisfied, you can
                escalate to the Office of the Australian Information
                Commissioner (OAIC) at{" "}
                <a
                  href="https://www.oaic.gov.au"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  oaic.gov.au
                </a>
                .
              </li>
            </ul>
          </section>

          <section id="security">
            <h2>8. Security</h2>
            <p>
              We protect your information with industry-standard
              practices: HTTPS for every page, bcrypt hashing for
              passwords (never stored in plain text), session cookies
              marked HttpOnly and Secure, salted IP hashing for view
              tracking, and an admin moderation layer for reported
              content. Our hosting provider applies further protections
              at the infrastructure layer.
            </p>
            <p>
              No system is perfectly secure. If we ever detect a data
              breach that meets the threshold under Australia&rsquo;s
              Notifiable Data Breaches scheme, we&rsquo;ll notify
              affected users and the OAIC as required by law.
            </p>
          </section>

          <section id="children">
            <h2>9. Children&rsquo;s privacy</h2>
            <p>
              frockd is intended for users aged 18 and over. We
              don&rsquo;t knowingly collect information from children
              under 18. If you become aware that a minor has created
              an account, contact us and we&rsquo;ll remove the
              account.
            </p>
          </section>

          <section id="changes">
            <h2>10. Changes to this policy</h2>
            <p>
              We may update this policy from time to time — to reflect
              new features, new service providers, or changes in
              Australian privacy law. The &ldquo;last updated&rdquo;
              date at the top tells you when it last changed. Material
              changes will also be flagged on the site or notified by
              email.
            </p>
          </section>

          <section id="contact">
            <h2>11. Contact us</h2>
            <p>
              Privacy questions, access or correction requests, and
              complaints can be raised via our{" "}
              <Link href="/support">support page</Link>. We respond
              within 30 days for privacy matters and faster where we
              can.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}

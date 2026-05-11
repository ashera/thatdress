import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateProfile } from "@/lib/actions/auth";
import { requestEmailChange } from "@/lib/actions/email-change";
import { deleteAccount } from "@/lib/actions/account";
import { query } from "@/lib/db";
import { countFriendsListed } from "@/lib/referral";
import { currentReferralTier } from "@/lib/referral-tiers";
import { Button, Field, Input } from "../_components/ui";

export const dynamic = "force-dynamic";

const TITLES = ["Mr", "Mrs", "Ms", "Mx", "Dr", "Prof"];

const EMAIL_ERRORS: Record<string, string> = {
  invalid: "That doesn't look like a valid email.",
  same: "That's already your current email.",
  password: "Password didn't match.",
  taken: "That email is already in use.",
  send: "We couldn't send the confirmation email. Try again in a moment.",
};

const DELETE_ERRORS: Record<string, string> = {
  password: "Password didn't match.",
  phrase: "Type DELETE exactly to confirm.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    email_sent?: string;
    email_error?: string;
    delete_error?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const {
    saved,
    email_sent: emailSent,
    email_error: emailError,
    delete_error: deleteError,
  } = await searchParams;
  const emailErrorMessage = emailError ? EMAIL_ERRORS[emailError] : null;
  const deleteErrorMessage = deleteError ? DELETE_ERRORS[deleteError] : null;

  const friendsListed = await countFriendsListed(user.id);
  const tier = currentReferralTier(friendsListed);

  // If the current user arrived via someone else's link, surface
  // who and when in the hero. Lookup is direct so we don't have to
  // carry referrer info on every getCurrentUser call site-wide.
  const referrerRow = await query<{
    first_name: string | null;
    surname: string | null;
    email: string | null;
    referred_at: string | null;
  }>(
    `SELECT r.first_name, r.surname, r.email,
            me.referred_at::text AS referred_at
       FROM users me
       JOIN users r ON r.id = me.referred_by_user_id
      WHERE me.id = $1::bigint
      LIMIT 1`,
    [user.id],
  );
  const referrer = referrerRow.rows[0] ?? null;
  const referrerName = referrer
    ? [referrer.first_name, referrer.surname]
        .map((s) => s?.trim() ?? "")
        .filter(Boolean)
        .join(" ") ||
      referrer.email?.split("@")[0] ||
      "a frockd member"
    : null;
  const referredAtLabel = referrer?.referred_at
    ? (() => {
        try {
          return new Date(referrer.referred_at).toLocaleDateString("en-AU", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } catch {
          return null;
        }
      })()
    : null;

  const displayName =
    [user.firstName, user.surname].filter(Boolean).join(" ").trim() ||
    user.email.split("@")[0] ||
    "Your profile";
  const initials = (() => {
    const f = user.firstName?.trim()?.[0];
    const s = user.surname?.trim()?.[0];
    if (f && s) return (f + s).toUpperCase();
    if (f) return f.toUpperCase();
    const local = user.email.split("@")[0] ?? "";
    return (local.slice(0, 2) || "??").toUpperCase();
  })();

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Hero — gradient card with avatar, name, verification, and
            tier badge when the user's hit a referral milestone. */}
        <section
          style={{
            position: "relative",
            padding: "var(--s-6) var(--s-6)",
            background:
              "linear-gradient(135deg, #fef9c3 0%, #fed7aa 45%, #fbcfe8 100%)",
            borderRadius: 16,
            border: "1px solid #fde68a",
            marginBottom: "var(--s-6)",
            overflow: "hidden",
          }}
        >
          <p
            className="eyebrow"
            style={{
              margin: "0 0 var(--s-2)",
              color: "#78350f",
              opacity: 0.85,
            }}
          >
            Your profile
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-4)",
              flexWrap: "wrap",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #1c1816 0%, #3a342f 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                flex: "0 0 auto",
                boxShadow:
                  "0 0 0 4px rgba(255,255,255,0.6), 0 4px 12px rgba(0,0,0,0.08)",
              }}
            >
              {initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--t-h1)",
                  color: "var(--ink-1)",
                  margin: "0 0 4px",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.05,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ minWidth: 0 }}>{displayName}</span>
                {tier && (
                  <span
                    title={tier.label}
                    aria-label={`Referral tier: ${tier.label}`}
                    style={{ fontSize: 28 }}
                  >
                    {tier.emoji}
                  </span>
                )}
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  color: "#3a342f",
                  fontSize: 14,
                }}
              >
                <span>{user.email}</span>
                {user.emailVerified ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(28,24,22,0.1)",
                      color: "#166534",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    ✓ Verified
                  </span>
                ) : (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(28,24,22,0.1)",
                      color: "#991b1b",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    Not verified
                  </span>
                )}
                {tier && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(28,24,22,0.1)",
                      color: "#1c1816",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    {tier.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <p
            style={{
              color: "#3a342f",
              margin: "var(--s-4) 0 0",
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            Got a friend with great dresses sitting in the back of a
            wardrobe?{" "}
            <Link
              href="/profile/refer"
              style={{
                color: "#1c1816",
                fontWeight: 600,
                textDecoration: "underline",
                textDecorationColor: "rgba(28,24,22,0.3)",
                textUnderlineOffset: 3,
              }}
            >
              Get your referral link →
            </Link>
          </p>
          {!user.emailVerified && (
            <p
              style={{
                color: "#3a342f",
                fontSize: 13,
                margin: "var(--s-3) 0 0",
                opacity: 0.85,
              }}
            >
              We sent a confirmation link when you signed up. Check
              your inbox, or use the Resend button in the banner above.
            </p>
          )}
          {referrerName && (
            <div
              style={{
                marginTop: "var(--s-4)",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(28,24,22,0.08)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 13,
                color: "#3a342f",
              }}
              title="The person whose referral link you signed up through"
            >
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                💌
              </span>
              <span>
                Invited by{" "}
                <strong style={{ color: "#1c1816" }}>{referrerName}</strong>
                {referredAtLabel ? (
                  <>
                    <span style={{ color: "#7a7470" }}> · joined </span>
                    {referredAtLabel}
                  </>
                ) : null}
              </span>
            </div>
          )}
        </section>

        {saved && (
          <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
            Saved.
          </p>
        )}

        <section className="form-card">
          <h2 className="card-heading">Personal info</h2>
          <p className="card-sub">
            Optional. Shown to buyers when you message them.
          </p>

          <form
            action={updateProfile}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <div className="grid-2">
              <Field label="Title" htmlFor="title">
                <select
                  id="title"
                  name="title"
                  className="input"
                  defaultValue={user.title ?? ""}
                >
                  <option value="">—</option>
                  {TITLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <div />
            </div>

            <div className="grid-2">
              <Field label="First name" htmlFor="first_name">
                <Input
                  id="first_name"
                  name="first_name"
                  type="text"
                  maxLength={64}
                  autoComplete="given-name"
                  defaultValue={user.firstName ?? ""}
                />
              </Field>
              <Field label="Surname" htmlFor="surname">
                <Input
                  id="surname"
                  name="surname"
                  type="text"
                  maxLength={64}
                  autoComplete="family-name"
                  defaultValue={user.surname ?? ""}
                />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Town / city" htmlFor="town">
                <Input
                  id="town"
                  name="town"
                  type="text"
                  maxLength={64}
                  autoComplete="address-level2"
                  defaultValue={user.town ?? ""}
                />
              </Field>
              <Field label="Postcode" htmlFor="postcode">
                <Input
                  id="postcode"
                  name="postcode"
                  type="text"
                  maxLength={16}
                  autoComplete="postal-code"
                  defaultValue={user.postcode ?? ""}
                />
              </Field>
            </div>

            <p className="card-sub" style={{ marginTop: 0 }}>
              Region is set automatically from your location and you can
              change it any time using the pill in the menu bar.
            </p>

            <h3
              className="card-heading"
              style={{
                marginTop: "var(--s-5)",
                marginBottom: "var(--s-2)",
                fontSize: 18,
              }}
            >
              Your measurements
            </h3>
            <p className="card-sub" style={{ marginTop: 0 }}>
              All optional. When you enter any of these, listing detail
              pages will show how each dress fits you against the
              seller&rsquo;s measurements. Private to you — sellers
              never see them.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "var(--s-3)",
              }}
            >
              <Field label="Bust (inches)" htmlFor="bust_inches">
                <Input
                  id="bust_inches"
                  name="bust_inches"
                  type="text"
                  inputMode="decimal"
                  pattern="^\d{1,3}(\.\d{1,2})?$"
                  placeholder="e.g. 36"
                  defaultValue={user.bustInches?.toString() ?? ""}
                />
              </Field>
              <Field label="Waist (inches)" htmlFor="waist_inches">
                <Input
                  id="waist_inches"
                  name="waist_inches"
                  type="text"
                  inputMode="decimal"
                  pattern="^\d{1,3}(\.\d{1,2})?$"
                  placeholder="e.g. 28"
                  defaultValue={user.waistInches?.toString() ?? ""}
                />
              </Field>
              <Field label="Hips (inches)" htmlFor="hips_inches">
                <Input
                  id="hips_inches"
                  name="hips_inches"
                  type="text"
                  inputMode="decimal"
                  pattern="^\d{1,3}(\.\d{1,2})?$"
                  placeholder="e.g. 38"
                  defaultValue={user.hipsInches?.toString() ?? ""}
                />
              </Field>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Save personal info
              </Button>
            </div>
          </form>
        </section>

        <section className="form-card" style={{ marginTop: "var(--s-5)" }}>
          <h2 className="card-heading">Change login email</h2>
          <p className="card-sub">
            Your email is also your username. Enter a new address and your
            current password — we&rsquo;ll send a confirmation link to the
            new address before switching.
          </p>

          {emailSent && !emailErrorMessage && (
            <p
              className="form-success"
              style={{ marginBottom: "var(--s-4)" }}
            >
              Confirmation sent. Click the link in the new inbox to finish
              the switch.
            </p>
          )}
          {emailErrorMessage && (
            <p
              className="form-error"
              style={{ marginBottom: "var(--s-4)" }}
            >
              {emailErrorMessage}
            </p>
          )}

          <form
            action={requestEmailChange}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <Field label="New email" htmlFor="new_email">
              <Input
                id="new_email"
                name="new_email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </Field>
            <Field label="Current password" htmlFor="email_change_password">
              <Input
                id="email_change_password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
              />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Send confirmation
              </Button>
            </div>
          </form>
        </section>

        <section
          className="form-card"
          style={{
            marginTop: "var(--s-5)",
            borderColor: "var(--danger-300, #f3c1c1)",
          }}
        >
          <h2 className="card-heading">Delete account</h2>
          <p className="card-sub">
            Permanently removes your account, all your listings (with their
            photos), conversations, offers, shortlist, saved searches, and
            support tickets. This can&rsquo;t be undone.
          </p>

          {deleteErrorMessage && (
            <p
              className="form-error"
              style={{ marginBottom: "var(--s-4)" }}
            >
              {deleteErrorMessage}
            </p>
          )}

          <form
            action={deleteAccount}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <Field label="Current password" htmlFor="delete_password">
              <Input
                id="delete_password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
              />
            </Field>
            <Field
              label="Type DELETE to confirm"
              htmlFor="delete_confirm"
            >
              <Input
                id="delete_confirm"
                name="confirm"
                type="text"
                autoComplete="off"
                required
                maxLength={16}
                placeholder="DELETE"
              />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="dark">
                Delete my account
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

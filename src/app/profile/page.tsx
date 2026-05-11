import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateProfile } from "@/lib/actions/auth";
import { requestEmailChange } from "@/lib/actions/email-change";
import { deleteAccount } from "@/lib/actions/account";
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

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 520, margin: "0 auto" }}>
        <p className="eyebrow">Your profile</p>
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
          Profile
        </h1>
        <p style={{ color: "var(--ink-3)", margin: "0 0 var(--s-3)" }}>
          Signed in as <strong>{user.email}</strong>.{" "}
          {user.emailVerified ? (
            <span className="users-tag --ok" style={{ marginLeft: 4 }}>
              Verified
            </span>
          ) : (
            <span className="users-tag --susp" style={{ marginLeft: 4 }}>
              Not verified
            </span>
          )}
        </p>
        <p
          style={{
            color: "var(--ink-2)",
            margin: "0 0 var(--s-5)",
            fontSize: 14,
          }}
        >
          Got a friend with great dresses sitting in the back of a
          wardrobe?{" "}
          <Link
            href="/profile/refer"
            style={{
              color: "var(--ink-1)",
              textDecoration: "underline",
              textDecorationColor: "var(--hairline-strong)",
              textUnderlineOffset: 3,
            }}
          >
            Get your referral link →
          </Link>
        </p>
        {!user.emailVerified && (
          <p
            style={{
              color: "var(--ink-3)",
              fontSize: "var(--t-body-s)",
              margin: "0 0 var(--s-7)",
            }}
          >
            We sent a confirmation link when you signed up. Check your
            inbox, or use the Resend button in the banner above.
          </p>
        )}
        {user.emailVerified && <div style={{ marginBottom: "var(--s-7)" }} />}

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

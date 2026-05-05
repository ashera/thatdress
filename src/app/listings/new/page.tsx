import { redirect } from "next/navigation";

// /listings/new is now a redirect — the "Start a new listing" button
// lives on /listings/mine alongside drafts in progress and existing
// listings. The wizard sub-paths (/listings/new/[id]/photos, etc.)
// are unaffected; this only handles the bare /listings/new URL.
export default function NewListingLandingRedirect(): never {
  redirect("/listings/mine");
}

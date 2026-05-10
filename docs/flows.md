# frockd workflows

Mermaid diagrams covering the major user journeys and system flows. Render in
GitHub, the VSCode markdown preview (with the Mermaid extension), or any
Mermaid-aware viewer.

The dress-as-first-class refactor split a listing into two entities — a
**dress** (the physical garment, persistent across owners) and a **listing**
(one offering of that dress for sale). The flows below assume that model.

---

## 1. Dress lifecycle

State machine for `dresses.disposition`. The four underlying values are
`available`, `in-use`, `kept`, `lost`. The admin UI splits `available` into
two display states by checking for a live published listing — `Listed` (has
one) vs `Drafted` (no live listing yet).

```mermaid
stateDiagram-v2
    [*] --> Drafted: startDraftListing\n(wizard begins)
    Drafted --> Listed: seller publishes
    Listed --> Drafted: seller hides listing
    Listed --> InUse: closeListingWithBuyer (with buyer)
    Listed --> Lost: closeListingWithBuyer (sold elsewhere)
    InUse --> Drafted: startRelistFromDress
    InUse --> Kept: markDressKept
    Kept --> Drafted: owner relists later

    note right of InUse
      Eligible for the
      relist-nudge cron
      (next_relist_nudge_at
       set to +90 days on sale)
    end note
```

The cron only fires for `disposition='in-use'`; once the buyer relists
(`Drafted`/`Listed`) or marks kept, nudges stop.

---

## 2. Listing wizard

Six-step flow for building or editing a listing. The wizard writes to
`dresses` (designer/silhouette/measurements) and `listings` (occasion/
condition/price/photos) in pair so each step persists immediately.

```mermaid
flowchart TD
    Mine[/"/listings/mine"/] -->|Start a new listing| Start[startDraftListing]
    Start --> Basics["Basics<br/>designer · model · year"]
    Basics --> Style["Style<br/>silhouette · fabric · neckline · sleeves · length · color"]
    Style --> Meas["Measurements<br/>size · bust · waist · hips · retail"]
    Meas --> Cond["Condition<br/>occasion · condition · alterations · receipt"]
    Cond --> Photos["Photos<br/>upload · primary"]
    Photos --> Pub["Publish<br/>price · location · description · trust confirmations"]
    Pub --> Action[publishDraftListing]
    Action --> Live[Listing live in browse]

    Nudge[Relist nudge email] -->|"List it again"| Relist[startRelistFromDress]
    Relist --> Basics

    style Live fill:#dcfce7,stroke:#166534
```

The relist entry point reuses the same wizard but skips dress creation —
physical attrs auto-fill from the existing `dresses` row, the new owner
re-enters listing-level fields (price, photos, condition).

---

## 3. Sale + review

Closing a listing with an attributed buyer kicks off three writes (listing,
dress, ownership event), issues a tokenised review link, and emails the buyer.

```mermaid
sequenceDiagram
    actor S as Seller
    actor B as Buyer
    participant App as frockd app
    participant DB as Database
    participant Mail as Email (Resend)

    S->>App: Mark sold + pick buyer
    App->>DB: UPDATE listings (sold_at, sold_to_user_id)
    App->>DB: UPDATE dresses (current_owner = buyer,<br/>disposition = 'in-use',<br/>next_relist_nudge_at = +90d)
    App->>DB: INSERT dress_ownership_events ('sold')
    App->>DB: INSERT listing_review_tokens (60d expiry)
    App->>Mail: Send tokenised review link
    Mail-->>B: "How did your purchase go?"

    B->>App: GET /listings/[id]/review/[token]
    App->>DB: lookupReviewToken
    B->>App: Submit stars + body + chips
    App->>DB: INSERT listing_reviews
    App->>DB: UPDATE listing_review_tokens (used_at = NOW)
    App-->>B: Redirect to seller profile
```

Sold-elsewhere (no buyer attributed) is the same shape minus the review token
and email; the dress goes to `disposition='lost'` instead of `'in-use'`.

---

## 4. Relist nudge

Time-triggered loop that turns one-shot sales into a circular marketplace.
Schedule is per-dress; rate-limited at the candidate-selection SQL.

```mermaid
flowchart TD
    Sale[Sale closed with buyer] -->|"+90 days scheduled"| Wait[Wait window]
    Wait --> Trigger{Cron run}
    Trigger -->|admin loads /admin| Run[runRelistNudgeBatch]
    Trigger -->|"GET /api/cron/relist-nudge<br/>(Bearer CRON_SECRET)"| Run
    Run --> Select["SELECT dresses<br/>disposition='in-use'<br/>+ nudge due<br/>+ last sent ≥ 60d ago<br/>+ owner verified"]
    Select --> Send[For each: sendRelistNudge]
    Send --> Email[Email owner]
    Send --> Roll[UPDATE last_sent + push next_nudge +60d]
    Email --> Land{Owner clicks link}
    Land -->|/dresses/[id]/relist| Pick{Owner picks}
    Pick -->|"List it again"| Available[startRelistFromDress<br/>disposition → 'available']
    Pick -->|"Keeping it"| Kept[markDressKept<br/>disposition → 'kept'<br/>nudge timestamps cleared]

    Force[Admin forces from /admin/dresses] -.->|forceRelistNudge| Send

    style Available fill:#cffafe,stroke:#155e75
    style Kept fill:#e0e7ff,stroke:#3730a3
```

The candidate filter is the rate limiter — refreshing /admin won't double-
email anyone.

---

## 5. Buy-side journey

End-to-end happy path for a buyer, from landing on the home page to leaving
a review after purchase.

```mermaid
flowchart TD
    Land[Land on / or /listings] --> Browse[Browse cards]
    Browse --> Interested{Interested?}
    Interested -->|Heart| Save[Add to shortlist]
    Interested -->|Open| Detail["/listings/[id]"]

    Save --> Short[/shortlist/]
    Short --> Detail

    Detail --> Action{Action}
    Action -->|Message seller| Conv[startConversation]
    Action -->|Make offer| Offer[submitOffer]
    Action -->|Save| Save

    Conv --> Thread[/"/messages/[id]"/]
    Offer --> Thread

    Thread --> Negotiate[Negotiate via messages]
    Negotiate -->|Sale agreed offline| MarkSold[Seller marks sold to buyer]
    MarkSold --> ReviewMail[Tokenised review email]
    ReviewMail --> ReviewPage["/listings/[id]/review/[token]"]
    ReviewPage --> Public[Review on seller profile]

    Public --> NudgeLater[90 days later: relist nudge fires]
```

The `NudgeLater` edge is what closes the loop into Flow #4 — the buyer
becomes a candidate seller of the same dress.

---

## 6. Auth

Standard email-verified registration + password reset. Sessions live in
cookies; tokens (verify, reset) live in DB tables with TTLs.

```mermaid
flowchart TD
    Reg[/register/] --> Submit[Submit email + password]
    Submit --> Insert[INSERT users<br/>email_verified_at = NULL]
    Insert --> VToken[Generate verify token]
    VToken --> VMail[Email verify link]
    VMail --> Click["GET /verify/[token]"]
    Click --> Check{Token valid?}
    Check -->|Yes| Verified[UPDATE email_verified_at = NOW]
    Check -->|Expired/used| Err[Show error]
    Verified --> Session[Session cookie set]

    Login[/login/] --> Cred[Submit credentials]
    Cred --> Match{Match?}
    Match -->|Yes + verified| Session
    Match -->|Yes but unverified| Resend[Resend verify email]
    Match -->|No| Bad[Wrong credentials]

    Forgot[/forgot/] --> RToken[Email reset token]
    RToken --> Reset["/reset/[token]"]
    Reset --> NewPass[Set new password]
    NewPass --> Session

    style Session fill:#dcfce7,stroke:#166534
```

Suspended users (`suspended_at IS NOT NULL`) can sign in technically but
hit a maintenance-style wall on every protected route.

---

## 7. Background jobs (cron piggyback)

Both cron job bodies are extracted into `src/lib/cron/*` and run from two
places: an external scheduler hitting `/api/cron/...` with a Bearer token,
and the admin landing page itself, which awaits both on every load.

```mermaid
sequenceDiagram
    actor A as Admin
    participant Page as /admin page
    participant J1 as runRelistNudgeBatch
    participant J2 as runSavedSearchDigest
    participant DB as Database
    participant Mail as Email (Resend)

    A->>Page: GET /admin
    par Jobs run in parallel
        Page->>J1: invoke
        J1->>DB: SELECT due dresses
        loop Each candidate dress
            J1->>Mail: send relist email
            J1->>DB: UPDATE last_sent + next +60d
        end
        J1-->>Page: { candidates, sent, errors, ms }
    and
        Page->>J2: invoke
        J2->>DB: SELECT verified users' saved searches
        loop Each search
            J2->>DB: findNewMatches since last_emailed_at
            alt Has new matches
                J2->>Mail: send digest
                J2->>DB: UPDATE last_emailed_at
            end
        end
        J2-->>Page: { searches, sent, errors, ms }
    end
    Page-->>A: Render Background jobs card

    Note over A,Mail: External cron (optional)<br/>GET /api/cron/relist-nudge<br/>or /api/cron/saved-searches<br/>Authorization: Bearer $CRON_SECRET
```

Per-row gates inside each job (the SQL filters) are the rate limiter, so
refreshing /admin doesn't re-send anything.

---

## 8. Trust + moderation

Listing trust state is `listings.trust_status` ∈
{`self-declared`, `verified`, `authenticated`, `flagged`}. Verified is
auto-elevated when a listing's health score crosses the configurable
threshold and both trust confirmations are ticked. Flagged is the
moderation queue.

```mermaid
stateDiagram-v2
    [*] --> SelfDeclared: listing published
    SelfDeclared --> Verified: health ≥ threshold<br/>+ trust confirmations ticked
    Verified --> SelfDeclared: health drops below threshold
    SelfDeclared --> Flagged: admin flag<br/>OR buyer report
    Verified --> Flagged: admin flag<br/>OR buyer report
    Flagged --> SelfDeclared: admin restores

    SelfDeclared --> Authenticated: admin promotes
    Verified --> Authenticated: admin promotes
    Authenticated --> SelfDeclared: admin demotes

    note right of Flagged
      Hidden from public browse,
      surfaced on
      /admin/listings/flagged
      with the reason + reporter
    end note
```

`recomputeListingTrustStatus` runs inline on listing detail view and re-
evaluates the auto-verified path so the badge stays in sync without a
background job.

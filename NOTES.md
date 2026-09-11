# Submission notes

## What I completed

All four behaviours from the brief, plus the review rules:

- **Filter the queue** — `listSubmissions` applies the optional status filter, and the page
  server component passes the validated `status` search param through (`all` means no filter).
- **Approve a pending submission** — sets `approved`, stamps `reviewed_at`, writes a
  `review_events` row with `action = 'approved'`.
- **Request changes with feedback** — sets `changes_requested`, saves the trimmed feedback on
  the submission, writes a `review_events` row carrying the same feedback.
- **Decisions survive a refresh** — everything is written to SQLite; the loader re-reads on
  each request, so there is no client-side state to go stale.

Rules enforced in `reviewSubmission`:

- Only a `pending` submission can be reviewed.
- Requesting changes requires non-empty feedback (whitespace-only is rejected).
- Every successful review appends exactly one `review_events` row.
- The submission update and the event insert happen in one transaction.
- A failed review returns `{ ok: false, error }` with a message the UI already renders, and
  leaves the data untouched.

## Interface and copy

The brief allows visual changes where they make success, failure, or status clear, and two
of those were genuinely unclear, so I kept the existing identity and retuned the surface as
a tool rather than a marketing page.

- **Approving gave no confirmation.** The action now returns a message and the page renders a
  success banner, so a saved decision is visible rather than inferred from the list redrawing.
- **The same status had two names.** The sidebar said "Awaiting review" while every badge said
  "Pending", so the word "pending" appeared nowhere in the navigation. One name per concept now.
- **Type was sized for a billboard.** The heading was `clamp(42px, 5vw, 70px)` at `-0.065em`
  tracking inside a 7ch column, while the content it framed ran at 11-13px. Both now sit on one
  fixed rem scale stepping 1.15x from a 15px base.
- **Contrast.** All 17 shipped text/background pairs clear 4.5:1. The textarea placeholder was
  2.9:1 before.
- **Decided submissions now show when the decision was made** and who the stored feedback went
  to, and each filter has its own empty state instead of one generic line.
- I removed the "Challenge timebox - 2 hours maximum" card, which was interview scaffolding
  rendered as product UI.

## Important decisions and trade-offs

**The status guard is the write itself, not a read-then-write.** Instead of `SELECT` →
check status → `UPDATE`, the update is `WHERE id = ? AND status = 'pending'` and I check how
many rows came back. A separate read leaves a window where two reviewers both see `pending`
and both write; making the status part of the update predicate closes it, and SQLite settles
the race. The extra `SELECT` only runs when nothing was claimed, purely to tell "already
reviewed" apart from "does not exist" for the error message.

**Errors are return values, not exceptions.** `reviewSubmission` returns a
`ReviewSubmissionResult` so the server action can hand it straight to the error banner. Unexpected failures (a genuine SQL error) are caught, logged server-side, and
flattened into a generic message — I did not want a driver error reaching the user.

**Validation lives in two places, deliberately.** The zod schema in the server action rejects a
blank textarea with a message aimed at the user. The service re-checks the trimmed feedback
because it is the thing that guarantees the invariant, and it is called directly by tests. The
action schema is UX; the service check is the actual rule.

**The framework boundary is thin on purpose.** Every rule lives in
`app/services/submission-service.ts`, which imports nothing from Next. That is why the whole
test suite is framework-agnostic, and it is what made porting this from the starter's React
Router shell to Next.js a change to the page and the config only.

**Feedback is trimmed once, in the service,** so what is stored on the submission and what is
stored on the event are always the same string.

## Tests

15 tests in `app/services/submission-service.test.ts`, all against a real in-memory SQLite
database rather than mocks, so the CHECK constraints and foreign keys are genuinely exercised.
They cover each filter, both review paths (including that the event row is written), blank and
whitespace-only feedback, re-reviewing an approved or changes-requested submission, a missing
submission, that a failed review leaves the data byte-identical, and — by dropping
`review_events` mid-flight — that the submission update rolls back when the event insert fails.
That last one is the only test that proves the transaction requirement rather than assuming it.

I also exercised the running app end to end: filtering by each status, approving, requesting
changes, the three error cases, and a reload confirming the decisions and the new
`review_events` rows persisted. The interface was checked at 1440px and 390px.

## What I would improve with more time

- **A test around the server action.** `submitReview` and the page component are only covered
  by my manual pass. I would add tests that call the action with a `FormData` so the zod schema
  and the error mapping are covered automatically.
- **Progressive enhancement.** The review forms post through a server action, so they need
  JavaScript. Next.js can run server actions from a plain form post, but the success and error
  banners are held in `useActionState`; moving that state into the URL or a cookie would make
  the page work with JS disabled.
- **Show the review history.** `review_events` is written but never read. The audit trail is
  the interesting part of a review desk, and the data is already there.
- **Optimistic UI.** `useNavigation` already disables the buttons while saving; the row could
  move to its new status immediately instead of waiting for the round trip.
- **A real migration system.** `initialiseSchema` is `CREATE TABLE IF NOT EXISTS`, which is
  fine for this exercise and explicitly out of scope, but it cannot evolve a schema.
- **Reviewer identity.** `review_events` records what happened but not who did it; that is the
  first column I would add once there is auth.

## Assumptions

- **The starter shipped as React Router 7; the brief asks for Next.js.** I took the brief as
  binding and ported it to Next.js 16 (App Router, server components, a server action), which
  is what this repository now runs. The database, schema, seed, validation, service, and all
  15 tests carried over untouched — only the page, the routing, and the build config were
  framework-specific. The starter's UI, copy, and behaviour are preserved.
- Reviews are final — the brief says only a `pending` submission can be reviewed, so I treated
  a decision as one-way. There is no un-approve or re-review.
- A single campaign manager, no auth (explicitly out of scope), so review events record no actor.
- Approving records `null` feedback rather than an empty string, so "no feedback given" and
  "empty feedback" are not confused.
- `reviewed_at` and the event's `created_at` are written with the same timestamp, so a
  submission and its event agree on when the decision happened.

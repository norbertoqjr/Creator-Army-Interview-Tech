# Submission notes

## What I completed

All four behaviours from the brief, plus the review rules:

- **Filter the queue** — `listSubmissions` applies the optional status filter, and `home.tsx`'s
  loader passes the validated search param through (`all` means no filter).
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

## Important decisions and trade-offs

**The status guard is the write itself, not a read-then-write.** Instead of `SELECT` →
check status → `UPDATE`, the update is `WHERE id = ? AND status = 'pending'` and I check how
many rows came back. A separate read leaves a window where two reviewers both see `pending`
and both write; making the status part of the update predicate closes it, and SQLite settles
the race. The extra `SELECT` only runs when nothing was claimed, purely to tell "already
reviewed" apart from "does not exist" for the error message.

**Errors are return values, not exceptions.** `reviewSubmission` returns a
`ReviewSubmissionResult` so the route action can hand it straight to the existing error
banner. Unexpected failures (a genuine SQL error) are caught, logged server-side, and
flattened into a generic message — I did not want a driver error reaching the user.

**Validation lives in two places, deliberately.** The zod schema in the route rejects a blank
textarea with a message aimed at the user. The service re-checks the trimmed feedback because
it is the thing that guarantees the invariant, and it is called directly by tests. The route
schema is UX; the service check is the actual rule.

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
`review_events` rows persisted.

## What I would improve with more time

- **A route-level test.** The loader and action are only covered by my manual pass. I would
  add tests that drive them through the React Router request/response cycle so the zod schema
  and the wiring are covered automatically.
- **Progressive enhancement.** A plain form post to `/` without JavaScript hits the root route
  and 405s; React Router's client `<Form>` appends `?index` for you. Setting an explicit
  `action="/?index"` on both forms would make the page work with JS disabled.
- **Show the review history.** `review_events` is written but never read. The audit trail is
  the interesting part of a review desk, and the data is already there.
- **Optimistic UI.** `useNavigation` already disables the buttons while saving; the row could
  move to its new status immediately instead of waiting for the round trip.
- **A real migration system.** `initialiseSchema` is `CREATE TABLE IF NOT EXISTS`, which is
  fine for this exercise and explicitly out of scope, but it cannot evolve a schema.
- **Reviewer identity.** `review_events` records what happened but not who did it; that is the
  first column I would add once there is auth.

## Assumptions

- **I kept the starter's stack.** The brief says "Build the solution with Next.js and
  TypeScript", but the repository is a React Router 7 framework-mode app, and the brief also
  says the UI, database, schemas, and tests are already provided. Rewriting it as Next.js
  would have meant discarding all of that, so I read the requirement as "TypeScript, in the
  framework the starter uses" and completed the project in place. Happy to port it if the
  Next.js requirement was meant literally.
- Reviews are final — the brief says only a `pending` submission can be reviewed, so I treated
  a decision as one-way. There is no un-approve or re-review.
- A single campaign manager, no auth (explicitly out of scope), so review events record no actor.
- Approving records `null` feedback rather than an empty string, so "no feedback given" and
  "empty feedback" are not confused.
- `reviewed_at` and the event's `created_at` are written with the same timestamp, so a
  submission and its event agree on when the decision happened.

# Creator Army engineering interview

## The task

You are completing a small content-review workflow for a Creator Army campaign manager.

Creators submit content for brand campaigns. The campaign manager needs to filter the review queue, approve suitable content, or request changes with feedback.

The starter project already includes the UI, a local SQLite database with seeded submissions, database schemas, form parsing, and a small test suite.

Complete the missing code so a campaign manager can:

1. Filter submissions by `pending`, `approved`, or `changes requested`.
2. Approve a pending submission.
3. Request changes to a pending submission and leave feedback.
4. Refresh the page and still see the saved review decision.

## Requirements

Your solution must follow these rules:

- Build the solution with Next.js and TypeScript.
- Only a `pending` submission can be reviewed.
- Requesting changes requires non-empty feedback.
- Every successful review adds a row to `review_events`.
- The submission update and review event are saved in one transaction.
- A failed review returns a useful error without changing the data.
- Tests cover the behaviour you implement.

You may change any code in the repository.

## Getting started

You will need Node.js 22+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The app creates and seeds its database at `.data/interview.db`
on first start.

Useful commands:

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run (15 tests)
pnpm build       # next build
pnpm start       # serve the production build
pnpm db:reset    # delete .data; the next start reseeds it
```

## How it works

Built with Next.js 16 (App Router), TypeScript, Drizzle and better-sqlite3.

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | Server component. Resolves the status filter from `searchParams`, reads the queue and the counts. |
| `app/review-queue.tsx` | The only client component. Holds the result banner in `useActionState`; per-card busy state comes from `useFormStatus`. |
| `app/actions.ts` | Server action behind both review forms. Validates, delegates to the service, revalidates only after a real change. |
| `app/services/submission-service.ts` | Every review rule and the transaction. Imports nothing from Next. |
| `app/lib/review-schema.ts` | Shared zod schema and the queue's labels and empty states. |
| `app/db/` | Schema, connection, seed data, and the reset script. |

The rules live in the service, not in the framework layer. That is why the whole test suite
runs without Next, and why the page could move from the starter's React Router shell to
Next.js without touching a single test.

### How a review is saved

`reviewSubmission` makes the status guard part of the write rather than a separate read:

```sql
UPDATE submissions SET ... WHERE id = ? AND status = 'pending'
```

If that matches no rows, nothing was written and the review is refused. A read-then-write
would leave a window where two reviewers both see `pending` and both save. The follow-up
`SELECT` runs only on that failure path, and only to tell "already reviewed" apart from
"does not exist" for the error message. The update and the `review_events` insert run inside
one `db.transaction`, so a failure on the second write rolls back the first.

## Tests

```bash
pnpm test
```

15 tests in `app/services/submission-service.test.ts`. They run against a **real in-memory
SQLite database** (`app/test/setup.ts`) built from the same `initialiseSchema` the app uses,
seeded with the same fixtures. Nothing is mocked except the `~/db` module, which is pointed
at the throwaway database. This means the `CHECK` constraints, the foreign key, and real
transaction behaviour are all exercised rather than simulated.

| Test | What it protects |
| --- | --- |
| lists seeded submissions newest first | The default queue ordering (`createdAt` descending). |
| returns counts for the queue navigation | The sidebar totals, including the `all` rollup. |
| returns only pending submissions, newest first | The `pending` filter, and that filtering does not lose the ordering. |
| returns only approved submissions | The `approved` filter. |
| returns only submissions with changes requested | The `changes_requested` filter. |
| marks it approved and records its review event | Approve writes the status, stamps `reviewedAt`, leaves feedback null, and adds exactly one event. |
| updates the queue counts | The counts move with the data, so the sidebar cannot drift from the queue. |
| saves the feedback and records its review event | Request-changes stores the feedback on both the submission and its event. |
| trims surrounding whitespace from the feedback | `"  text  "` is stored clean, so the submission and the event always agree. |
| rejects blank feedback without touching the data | Whitespace-only feedback is refused **and** writes nothing. |
| refuses to review an already approved submission | The pending-only rule, against an `approved` row. |
| refuses to re-review a submission with changes requested | The pending-only rule, against a `changes_requested` row, and that the original feedback survives. |
| refuses to review a submission that does not exist | A missing id fails cleanly instead of throwing. |
| does not change the data when a review fails | After two failed reviews the whole table is byte-identical and the counts are unchanged. |
| rolls back the submission update if the review event cannot be written | **The transaction itself.** `review_events` is dropped mid-flight so the second write fails; the submission must still be `pending` with a null `reviewedAt`. |

That last test is the only one that proves the one-transaction requirement rather than
assuming it. Without it, a version that wrote the two rows separately would still pass
everything else.

### Requirement coverage

| Requirement | Covered by |
| --- | --- |
| Only a `pending` submission can be reviewed | the three "refuses to review" tests |
| Requesting changes requires non-empty feedback | "rejects blank feedback without touching the data" |
| Every successful review adds a row to `review_events` | both "records its review event" tests |
| Update and event saved in one transaction | "rolls back the submission update…" |
| A failed review returns a useful error without changing the data | "does not change the data when a review fails" |

Filtering, approving, requesting changes, the error paths, and persistence across a reload
were also checked by hand in the running app, in both `pnpm dev` and the production build.

## Out of scope

Do not add authentication, file uploads, deployment, external APIs, real-time updates, or a production migration system.
Visual changes are optional unless they are needed to make success, failure, or submission status clear.

## What to submit

Submit your completed project with a short note covering:

- What you completed
- Important decisions or trade-offs
- What you would improve with more time
- Any assumptions you made

That note is in [NOTES.md](NOTES.md).

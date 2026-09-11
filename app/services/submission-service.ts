import { and, count, desc, eq } from "drizzle-orm";

import { db } from "~/db";
import {
  reviewEvents,
  submissions,
  type SubmissionStatus,
} from "~/db/schema";

export type ReviewSubmissionInput =
  | { submissionId: number; intent: "approve" }
  | {
      submissionId: number;
      intent: "request-changes";
      feedback: string;
    };

export type ReviewSubmissionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Maps the form intent onto the status and review_events action it produces. */
const reviewOutcomes = {
  approve: "approved",
  "request-changes": "changes_requested",
} as const satisfies Record<ReviewSubmissionInput["intent"], SubmissionStatus>;

export function listSubmissions({ status }: { status?: SubmissionStatus }) {
  return db
    .select()
    .from(submissions)
    .where(status ? eq(submissions.status, status) : undefined)
    .orderBy(desc(submissions.createdAt))
    .all();
}

export function getSubmissionCounts(): Record<"all" | SubmissionStatus, number> {
  const rows = db
    .select({ status: submissions.status, count: count() })
    .from(submissions)
    .groupBy(submissions.status)
    .all();

  const counts: Record<"all" | SubmissionStatus, number> = {
    all: 0,
    pending: 0,
    approved: 0,
    changes_requested: 0,
  };

  for (const row of rows) {
    counts[row.status] = row.count;
    counts.all += row.count;
  }

  return counts;
}

export function reviewSubmission(
  input: ReviewSubmissionInput,
): ReviewSubmissionResult {
  const feedback =
    input.intent === "request-changes" ? input.feedback.trim() : null;

  if (input.intent === "request-changes" && !feedback) {
    return {
      ok: false,
      error: "Tell the creator what to change before requesting changes.",
    };
  }

  const nextStatus = reviewOutcomes[input.intent];
  const reviewedAt = new Date().toISOString();

  try {
    return db.transaction((tx): ReviewSubmissionResult => {
      // Claim the row by status as well as id, so a submission reviewed by
      // someone else in the meantime cannot be reviewed twice.
      const claimed = tx
        .update(submissions)
        .set({
          status: nextStatus,
          reviewerFeedback: feedback,
          reviewedAt,
        })
        .where(
          and(
            eq(submissions.id, input.submissionId),
            eq(submissions.status, "pending"),
          ),
        )
        .returning({ id: submissions.id })
        .all();

      if (claimed.length === 0) {
        // Nothing was written, so distinguish "missing" from "already reviewed"
        // only to produce a useful message.
        const existing = tx
          .select({ status: submissions.status })
          .from(submissions)
          .where(eq(submissions.id, input.submissionId))
          .get();

        return {
          ok: false,
          error: existing
            ? "This submission has already been reviewed."
            : "That submission no longer exists.",
        };
      }

      tx.insert(reviewEvents)
        .values({
          submissionId: input.submissionId,
          action: nextStatus,
          feedback,
          createdAt: reviewedAt,
        })
        .run();

      return { ok: true };
    });
  } catch (error) {
    console.error("Failed to review submission", error);

    return {
      ok: false,
      error: "We could not save that review. Please try again.",
    };
  }
}

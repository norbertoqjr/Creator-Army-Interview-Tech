import { eq, sql } from "drizzle-orm";

import { reviewEvents, submissions } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

const { getSubmissionCounts, listSubmissions, reviewSubmission } = await import(
  "~/services/submission-service"
);

beforeEach(() => {
  testDb = createTestDb();
  seedBaseData(testDb);
});

function submissionById(id: number) {
  return testDb.select().from(submissions).where(eq(submissions.id, id)).get();
}

function eventsFor(submissionId: number) {
  return testDb
    .select()
    .from(reviewEvents)
    .where(eq(reviewEvents.submissionId, submissionId))
    .all();
}

describe("submission service", () => {
  it("lists seeded submissions newest first", () => {
    const result = listSubmissions({});

    expect(result).toHaveLength(5);
    expect(result[0]?.creatorName).toBe("Maya Chen");
  });

  it("returns counts for the queue navigation", () => {
    expect(getSubmissionCounts()).toEqual({
      all: 5,
      pending: 3,
      approved: 1,
      changes_requested: 1,
    });
  });

  describe("filtering the queue by submission status", () => {
    it("returns only pending submissions, newest first", () => {
      const result = listSubmissions({ status: "pending" });

      expect(result).toHaveLength(3);
      expect(result.map((row) => row.status)).toEqual([
        "pending",
        "pending",
        "pending",
      ]);
      expect(result[0]?.creatorName).toBe("Maya Chen");
    });

    it("returns only approved submissions", () => {
      const result = listSubmissions({ status: "approved" });

      expect(result.map((row) => row.creatorName)).toEqual(["Leo Martin"]);
    });

    it("returns only submissions with changes requested", () => {
      const result = listSubmissions({ status: "changes_requested" });

      expect(result.map((row) => row.creatorName)).toEqual(["Ruby Jones"]);
    });
  });

  describe("approving a submission", () => {
    it("marks it approved and records its review event", () => {
      expect(reviewSubmission({ submissionId: 1, intent: "approve" })).toEqual({
        ok: true,
      });

      const submission = submissionById(1);
      expect(submission?.status).toBe("approved");
      expect(submission?.reviewerFeedback).toBeNull();
      expect(submission?.reviewedAt).toEqual(expect.any(String));

      expect(eventsFor(1)).toEqual([
        expect.objectContaining({
          submissionId: 1,
          action: "approved",
          feedback: null,
        }),
      ]);
    });

    it("updates the queue counts", () => {
      reviewSubmission({ submissionId: 1, intent: "approve" });

      expect(getSubmissionCounts()).toMatchObject({
        pending: 2,
        approved: 2,
      });
    });
  });

  describe("requesting changes", () => {
    it("saves the feedback and records its review event", () => {
      const feedback = "Add the campaign hashtag to the caption.";

      expect(
        reviewSubmission({
          submissionId: 2,
          intent: "request-changes",
          feedback,
        }),
      ).toEqual({ ok: true });

      const submission = submissionById(2);
      expect(submission?.status).toBe("changes_requested");
      expect(submission?.reviewerFeedback).toBe(feedback);

      expect(eventsFor(2)).toEqual([
        expect.objectContaining({
          action: "changes_requested",
          feedback,
        }),
      ]);
    });

    it("trims surrounding whitespace from the feedback", () => {
      reviewSubmission({
        submissionId: 2,
        intent: "request-changes",
        feedback: "  Reshoot the intro.  ",
      });

      expect(submissionById(2)?.reviewerFeedback).toBe("Reshoot the intro.");
    });

    it("rejects blank feedback without touching the data", () => {
      const result = reviewSubmission({
        submissionId: 2,
        intent: "request-changes",
        feedback: "   ",
      });

      expect(result).toEqual({ ok: false, error: expect.any(String) });
      expect(submissionById(2)?.status).toBe("pending");
      expect(eventsFor(2)).toHaveLength(0);
    });
  });

  describe("rejecting invalid reviews", () => {
    it("refuses to review an already approved submission", () => {
      const result = reviewSubmission({ submissionId: 4, intent: "approve" });

      expect(result.ok).toBe(false);
      expect(eventsFor(4)).toHaveLength(1);
    });

    it("refuses to re-review a submission with changes requested", () => {
      const result = reviewSubmission({
        submissionId: 5,
        intent: "request-changes",
        feedback: "Another round of notes.",
      });

      expect(result.ok).toBe(false);
      expect(submissionById(5)?.reviewerFeedback).toBe(
        "Show the product in the opening five seconds.",
      );
      expect(eventsFor(5)).toHaveLength(1);
    });

    it("refuses to review a submission that does not exist", () => {
      const result = reviewSubmission({ submissionId: 999, intent: "approve" });

      expect(result.ok).toBe(false);
      expect(eventsFor(999)).toHaveLength(0);
    });

    it("does not change the data when a review fails", () => {
      const before = listSubmissions({});

      reviewSubmission({ submissionId: 4, intent: "approve" });
      reviewSubmission({ submissionId: 999, intent: "approve" });

      expect(listSubmissions({})).toEqual(before);
      expect(getSubmissionCounts()).toEqual({
        all: 5,
        pending: 3,
        approved: 1,
        changes_requested: 1,
      });
    });

    it("rolls back the submission update if the review event cannot be written", () => {
      // Force the second write in the transaction to fail for a real reason,
      // then assert the first write did not survive on its own.
      testDb.run(sql`DROP TABLE review_events`);
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = reviewSubmission({ submissionId: 1, intent: "approve" });

      expect(result).toEqual({ ok: false, error: expect.any(String) });
      expect(submissionById(1)?.status).toBe("pending");
      expect(submissionById(1)?.reviewedAt).toBeNull();

      vi.restoreAllMocks();
    });
  });
});

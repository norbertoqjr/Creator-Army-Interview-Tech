import { Form, Link, useNavigation } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/home";
import { submissionStatuses } from "~/db/schema";
import { parseFormData } from "~/lib/validation";
import {
  getSubmissionCounts,
  listSubmissions,
  reviewSubmission,
} from "~/services/submission-service";

const queueFilters = ["all", ...submissionStatuses] as const;
type QueueFilter = (typeof queueFilters)[number];

const filterLabels: Record<QueueFilter, string> = {
  all: "All submissions",
  pending: "Awaiting review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

const reviewSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    submissionId: z.coerce.number().int().positive(),
  }),
  z.object({
    intent: z.literal("request-changes"),
    submissionId: z.coerce.number().int().positive(),
    feedback: z.string().trim().min(1, "Tell the creator what to change."),
  }),
]);

export function meta() {
  return [
    { title: "Review desk | Creator Army" },
    {
      name: "description",
      content: "Review creator submissions for active campaigns.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const requestedFilter = new URL(request.url).searchParams.get("status");
  const parsedFilter = z.enum(queueFilters).safeParse(requestedFilter);
  const status: QueueFilter = parsedFilter.success ? parsedFilter.data : "all";

  const queue = listSubmissions(
    status === "all" ? {} : { status },
  );

  return {
    queue,
    counts: getSubmissionCounts(),
    status,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = parseFormData(await request.formData(), reviewSchema);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: Object.values(parsed.errors)[0] ?? "Check the review details.",
    };
  }

  return reviewSubmission(parsed.data);
}

function formatStatus(status: (typeof submissionStatuses)[number]): string {
  return status === "changes_requested"
    ? "Changes requested"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export default function ReviewDesk({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { queue, counts, status } = loaderData;
  const navigation = useNavigation();
  const activeSubmissionId = navigation.formData?.get("submissionId");

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Creator Army review desk">
          <span className="brand-mark" aria-hidden="true">
            CA
          </span>
          <span>Creator Army</span>
        </Link>
        <span className="workspace-name">Campaign operations</span>
      </header>

      <div className="workspace">
        <aside className="queue-sidebar">
          <div>
            <p className="sidebar-kicker">Today’s queue</p>
            <h1>Review desk</h1>
            <p className="sidebar-copy">
              Keep campaigns moving by giving creators a clear decision.
            </p>
          </div>

          <nav className="queue-navigation" aria-label="Submission status">
            {queueFilters.map((filter) => (
              <Link
                key={filter}
                to={filter === "all" ? "/" : `/?status=${filter}`}
                className={status === filter ? "queue-link active" : "queue-link"}
              >
                <span>{filterLabels[filter]}</span>
                <span className="queue-count">{counts[filter]}</span>
              </Link>
            ))}
          </nav>

          <div className="timebox-note">
            <span>Challenge timebox</span>
            <strong>2 hours maximum</strong>
          </div>
        </aside>

        <section className="queue-content" aria-labelledby="queue-heading">
          <div className="queue-heading-row">
            <div>
              <p className="queue-context">Content review</p>
              <h2 id="queue-heading">{filterLabels[status]}</h2>
            </div>
            <span className="result-count">
              {queue.length} {queue.length === 1 ? "submission" : "submissions"}
            </span>
          </div>

          {actionData && !actionData.ok ? (
            <div className="error-banner" role="alert">
              <strong>Review not saved.</strong> {actionData.error}
            </div>
          ) : null}

          {queue.length === 0 ? (
            <div className="empty-state">
              <h3>Nothing waiting here</h3>
              <p>Choose another status to see the rest of the review queue.</p>
            </div>
          ) : (
            <div className="submission-list">
              {queue.map((submission) => {
                const isSubmitting =
                  navigation.state === "submitting" &&
                  activeSubmissionId === String(submission.id);

                return (
                  <article className="submission" key={submission.id}>
                    <div className="submission-summary">
                      <div className="creator-avatar" aria-hidden="true">
                        {initials(submission.creatorName)}
                      </div>
                      <div className="submission-identity">
                        <h3>{submission.creatorName}</h3>
                        <p>{submission.campaignName}</p>
                      </div>
                      <span className={`status-badge ${submission.status}`}>
                        {formatStatus(submission.status)}
                      </span>
                    </div>

                    <div className="submission-body">
                      <a
                        className="content-link"
                        href={submission.contentUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View submitted content
                        <span aria-hidden="true">↗</span>
                      </a>

                      {submission.reviewerFeedback ? (
                        <blockquote>{submission.reviewerFeedback}</blockquote>
                      ) : null}

                      {submission.status === "pending" ? (
                        <div className="review-actions">
                          <Form method="post">
                            <input
                              type="hidden"
                              name="submissionId"
                              value={submission.id}
                            />
                            <input type="hidden" name="intent" value="approve" />
                            <button
                              className="approve-button"
                              type="submit"
                              disabled={isSubmitting}
                            >
                              {isSubmitting ? "Saving…" : "Approve"}
                            </button>
                          </Form>

                          <Form method="post" className="feedback-form">
                            <input
                              type="hidden"
                              name="submissionId"
                              value={submission.id}
                            />
                            <input
                              type="hidden"
                              name="intent"
                              value="request-changes"
                            />
                            <label htmlFor={`feedback-${submission.id}`}>
                              Feedback for the creator
                            </label>
                            <div className="feedback-row">
                              <textarea
                                id={`feedback-${submission.id}`}
                                name="feedback"
                                rows={2}
                                placeholder="Be specific about what needs to change"
                              />
                              <button
                                className="changes-button"
                                type="submit"
                                disabled={isSubmitting}
                              >
                                Request changes
                              </button>
                            </div>
                          </Form>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


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
  pending: "Pending",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/** Each empty state names the specific situation, not a generic "nothing here". */
const emptyStates: Record<QueueFilter, { title: string; body: string }> = {
  all: {
    title: "No submissions yet",
    body: "Creator content appears here as soon as it is submitted to a campaign.",
  },
  pending: {
    title: "Nothing left to review",
    body: "Every submission has a decision. New content will land here when creators submit.",
  },
  approved: {
    title: "No approved submissions yet",
    body: "Content you approve will be listed here.",
  },
  changes_requested: {
    title: "No change requests",
    body: "Submissions you send back with feedback will be listed here.",
  },
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

  const result = reviewSubmission(parsed.data);

  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  return {
    ok: true as const,
    message:
      parsed.data.intent === "approve"
        ? "Submission approved."
        : "Changes requested. Your feedback is saved for the creator.",
  };
}

function formatStatus(status: (typeof submissionStatuses)[number]): string {
  return status === "changes_requested"
    ? "Changes requested"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

type IconProps = { size?: number };

function Icon({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function CheckIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.4 8.2 7.2 10l3.4-3.6" />
    </Icon>
  );
}

function WarningIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 5v3.4" />
      <path d="M8 10.9h.01" />
    </Icon>
  );
}

function ExternalLinkIcon() {
  return (
    <Icon size={14}>
      <path d="M9.5 3h3.5v3.5" />
      <path d="M12.6 3.4 7.4 8.6" />
      <path d="M11.5 9.8v2.4a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.4" />
    </Icon>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Formatted in UTC on purpose: a locale-dependent string would not survive hydration. */
function formatReviewedAt(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
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
            <h1>Review desk</h1>
            <p className="sidebar-copy">
              Approve creator content, or send it back with feedback on what to
              change.
            </p>
          </div>

          <nav className="queue-navigation" aria-label="Filter by status">
            <p className="nav-heading">Status</p>
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
        </aside>

        <section className="queue-content" aria-labelledby="queue-heading">
          <div className="queue-heading-row">
            <h2 id="queue-heading">{filterLabels[status]}</h2>
            <span className="result-count">
              {queue.length} {queue.length === 1 ? "submission" : "submissions"}
            </span>
          </div>

          {actionData && !actionData.ok ? (
            <div className="banner banner-error" role="alert">
              <span className="banner-icon" aria-hidden="true">
                <WarningIcon />
              </span>
              <span>
                <strong>Review not saved.</strong> {actionData.error}
              </span>
            </div>
          ) : null}

          {actionData?.ok ? (
            <div className="banner banner-success" role="status">
              <span className="banner-icon" aria-hidden="true">
                <CheckIcon />
              </span>
              <span>{actionData.message}</span>
            </div>
          ) : null}

          {queue.length === 0 ? (
            <div className="empty-state">
              <h3>{emptyStates[status].title}</h3>
              <p>{emptyStates[status].body}</p>
            </div>
          ) : (
            <div className="submission-list">
              {queue.map((submission) => {
                const isSubmitting =
                  navigation.state === "submitting" &&
                  activeSubmissionId === String(submission.id);
                const reviewedOn = formatReviewedAt(submission.reviewedAt);

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
                        <ExternalLinkIcon />
                        <span className="visually-hidden">(opens in a new tab)</span>
                      </a>

                      {submission.reviewerFeedback ? (
                        <div className="feedback-note">
                          <span className="feedback-note-label">
                            Feedback sent to {submission.creatorName}
                          </span>
                          <p>{submission.reviewerFeedback}</p>
                        </div>
                      ) : null}

                      {reviewedOn ? (
                        <p className="reviewed-note">
                          {submission.status === "approved"
                            ? "Approved"
                            : "Changes requested"}{" "}
                          on {reviewedOn}
                        </p>
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
                              {isSubmitting ? "Saving…" : "Approve submission"}
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
                              Feedback for {submission.creatorName}
                            </label>
                            <p
                              className="feedback-hint"
                              id={`feedback-hint-${submission.id}`}
                            >
                              Required to request changes. Name what to change
                              and why.
                            </p>
                            <div className="feedback-row">
                              <textarea
                                id={`feedback-${submission.id}`}
                                name="feedback"
                                rows={2}
                                aria-describedby={`feedback-hint-${submission.id}`}
                                placeholder="e.g. Show the product in the opening five seconds."
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


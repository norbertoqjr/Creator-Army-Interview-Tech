"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { submitReview, type ReviewState } from "~/actions";
import { emptyStates, type QueueFilter } from "~/lib/review-schema";
import type { listSubmissions } from "~/services/submission-service";

type Submission = ReturnType<typeof listSubmissions>[number];

/* Icons are drawn at one stroke weight rather than borrowed from a glyph. */

function Icon({
  size = 16,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}) {
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

function formatStatus(status: Submission["status"]): string {
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

/** useFormStatus reports the pending state of its own form, not the whole page. */
function SubmitButton({
  className,
  children,
  busyLabel,
}: {
  className: string;
  children: React.ReactNode;
  busyLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? busyLabel : children}
    </button>
  );
}

export function ReviewQueue({
  queue,
  status,
}: {
  queue: Submission[];
  status: QueueFilter;
}) {
  const [state, formAction] = useActionState<ReviewState, FormData>(
    submitReview,
    null,
  );

  return (
    <>
      {state && !state.ok ? (
        <div className="banner banner-error" role="alert">
          <span className="banner-icon">
            <WarningIcon />
          </span>
          <span>
            <strong>Review not saved.</strong> {state.error}
          </span>
        </div>
      ) : null}

      {state?.ok ? (
        <div className="banner banner-success" role="status">
          <span className="banner-icon">
            <CheckIcon />
          </span>
          <span>{state.message}</span>
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
                      <form action={formAction}>
                        <input
                          type="hidden"
                          name="submissionId"
                          value={submission.id}
                        />
                        <input type="hidden" name="intent" value="approve" />
                        <SubmitButton
                          className="approve-button"
                          busyLabel="Saving…"
                        >
                          Approve submission
                        </SubmitButton>
                      </form>

                      <form action={formAction} className="feedback-form">
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
                          Required to request changes. Name what to change and
                          why.
                        </p>
                        <div className="feedback-row">
                          <textarea
                            id={`feedback-${submission.id}`}
                            name="feedback"
                            rows={2}
                            aria-describedby={`feedback-hint-${submission.id}`}
                            placeholder="e.g. Show the product in the opening five seconds."
                          />
                          <SubmitButton
                            className="changes-button"
                            busyLabel="Saving…"
                          >
                            Request changes
                          </SubmitButton>
                        </div>
                      </form>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

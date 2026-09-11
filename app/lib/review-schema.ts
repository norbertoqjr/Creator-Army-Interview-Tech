import { z } from "zod";

import { submissionStatuses } from "~/db/schema";

export const queueFilters = ["all", ...submissionStatuses] as const;
export type QueueFilter = (typeof queueFilters)[number];

export const reviewSchema = z.discriminatedUnion("intent", [
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

export const filterLabels: Record<QueueFilter, string> = {
  all: "All submissions",
  pending: "Pending",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/** Each empty state names the specific situation, not a generic "nothing here". */
export const emptyStates: Record<QueueFilter, { title: string; body: string }> = {
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

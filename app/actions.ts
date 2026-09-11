"use server";

import { revalidatePath } from "next/cache";

import { parseFormData } from "~/lib/validation";
import { reviewSchema } from "~/lib/review-schema";
import { reviewSubmission } from "~/services/submission-service";

export type ReviewState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

/**
 * Server action behind both review forms. It validates the submitted fields,
 * delegates the rules and the transaction to the service, and only revalidates
 * the queue when something actually changed.
 */
export async function submitReview(
  _previousState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const parsed = parseFormData(formData, reviewSchema);

  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(parsed.errors)[0] ?? "Check the review details.",
    };
  }

  const result = reviewSubmission(parsed.data);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/");

  return {
    ok: true,
    message:
      parsed.data.intent === "approve"
        ? "Submission approved."
        : "Changes requested. Your feedback is saved for the creator.",
  };
}

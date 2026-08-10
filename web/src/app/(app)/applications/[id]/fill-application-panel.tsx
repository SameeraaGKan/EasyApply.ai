"use client";

import { useActionState } from "react";
import { fillApplicationAction, type FillActionState } from "./actions";

const initialState: FillActionState = { error: null };

const STATUS_STYLES: Record<string, string> = {
  filled: "text-green-700 dark:text-green-500",
  skipped: "text-neutral-500",
  failed: "text-red-600",
};

export function FillApplicationPanel({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(fillApplicationAction, initialState);

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Fill out this application</h2>
          <p className="text-sm text-neutral-500">
            Opens the real application page and fills it from your profile, resume, and any
            answered questions above. Stops before the submit button — you always review and
            submit it yourself.
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "Filling…" : "Fill application"}
          </button>
        </form>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state.fields && state.fields.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
          <span className="font-medium">Field report</span>
          {state.fields.map((f, i) => (
            <div key={i} className="flex gap-2">
              <span className={STATUS_STYLES[f.status] ?? ""}>{f.status}</span>
              <span>{f.field_label}</span>
              {f.detail && <span className="text-neutral-500">— {f.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {state.unmatchedQuestions && state.unmatchedQuestions.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
          <span className="font-medium text-amber-600">
            Questions found on the page with no matching answer — add them above and re-run:
          </span>
          {state.unmatchedQuestions.map((q, i) => (
            <span key={i} className="text-neutral-500">
              {q}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

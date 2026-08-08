"use client";

import { useActionState } from "react";
import { updateStatus, updateNotes, type ActionState } from "./actions";

const initialState: ActionState = { error: null };
const inputClass =
  "rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "form_filled_pending_review", label: "Ready to submit" },
  { value: "submitted_by_user", label: "Submitted" },
  { value: "rejected", label: "Rejected" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function StatusNotesPanel({
  applicationId,
  status,
  notes,
}: {
  applicationId: string;
  status: string;
  notes: string;
}) {
  const [statusState, statusAction, statusPending] = useActionState(updateStatus, initialState);
  const [notesState, notesAction, notesPending] = useActionState(updateNotes, initialState);

  return (
    <div className="flex flex-col gap-4 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <form action={statusAction} className="flex items-center gap-3">
        <input type="hidden" name="applicationId" value={applicationId} />
        <label className="text-sm font-medium" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          disabled={statusPending}
          className={inputClass}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {statusState.error && <span className="text-sm text-red-600">{statusState.error}</span>}
      </form>

      <form action={notesAction} className="flex flex-col gap-2">
        <input type="hidden" name="applicationId" value={applicationId} />
        <label className="text-sm font-medium" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={notes}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={notesPending}
          className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          {notesPending ? "Saving…" : "Save notes"}
        </button>
        {notesState.error && <span className="text-sm text-red-600">{notesState.error}</span>}
      </form>
    </div>
  );
}

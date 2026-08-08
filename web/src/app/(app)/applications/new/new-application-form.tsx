"use client";

import { useActionState, useState } from "react";
import { createApplication, type NewApplicationState } from "./actions";

const initialState: NewApplicationState = { error: null };
const inputClass =
  "rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900";
const labelClass = "flex flex-col gap-1 text-sm";

export function NewApplicationForm() {
  const [state, action, pending] = useActionState(createApplication, initialState);
  const [jobInputMode, setJobInputMode] = useState<"none" | "url" | "paste">("none");

  return (
    <form action={action} className="flex flex-col gap-6">
      <label className={labelClass}>
        Company
        <input name="companyName" required className={inputClass} />
      </label>
      <label className={labelClass}>
        Role title
        <input name="roleTitle" required className={inputClass} />
      </label>
      <label className={labelClass}>
        Application URL (where you&apos;ll submit it)
        <input name="applicationUrl" type="url" className={inputClass} />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Job description (optional)</span>
        <p className="text-sm text-neutral-500">
          Paste the posting URL or the description text — it grounds the agent&apos;s drafted
          answers and will be used for job matching in a later phase.
        </p>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="jobInputMode"
              checked={jobInputMode === "none"}
              onChange={() => setJobInputMode("none")}
            />
            Skip
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="jobInputMode"
              checked={jobInputMode === "url"}
              onChange={() => setJobInputMode("url")}
            />
            Paste URL
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="jobInputMode"
              checked={jobInputMode === "paste"}
              onChange={() => setJobInputMode("paste")}
            />
            Paste description
          </label>
        </div>
        {jobInputMode === "url" && (
          <input name="jobUrl" type="url" placeholder="https://…" className={inputClass} />
        )}
        {jobInputMode === "paste" && (
          <textarea
            name="jobDescription"
            rows={8}
            placeholder="Paste the job description here"
            className={inputClass}
          />
        )}
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Creating…" : "Create application"}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useRef } from "react";
import { addQuestion, type ActionState } from "./actions";

const initialState: ActionState = { error: null };
const inputClass =
  "rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function AddQuestionForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(addQuestion, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2 rounded border border-neutral-200 p-3 dark:border-neutral-800"
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <textarea
        name="questionText"
        placeholder="Paste the application question"
        required
        rows={2}
        className={inputClass}
      />
      <div className="flex gap-3">
        <select name="questionType" defaultValue="short_text" className={inputClass}>
          <option value="short_text">Short answer</option>
          <option value="long_text">Long answer</option>
          <option value="multiple_choice">Multiple choice</option>
          <option value="yes_no">Yes / No</option>
          <option value="file_upload">File upload</option>
        </select>
        <select name="answerMode" defaultValue="agent" className={inputClass}>
          <option value="agent">Let the agent draft it (recommended)</option>
          <option value="user">I&apos;ll answer it</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          {pending ? "Adding…" : "Add question"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

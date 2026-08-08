"use client";

import { useActionState } from "react";
import { saveAnswer, deleteQuestion, draftPendingAnswers, type ActionState } from "./actions";

const initialState: ActionState = { error: null };
const inputClass =
  "rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

type Question = {
  id: string;
  questionText: string;
  questionType: string;
  answerText: string | null;
  answeredBy: string | null;
};

function QuestionItem({ applicationId, question }: { applicationId: string; question: Question }) {
  const [state, action, pending] = useActionState(saveAnswer, initialState);
  const isAgent = question.answeredBy === "agent";

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{question.questionText}</p>
        <form action={deleteQuestion}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="questionId" value={question.id} />
          <button type="submit" className="text-xs text-red-600">
            Remove
          </button>
        </form>
      </div>
      <span className="text-xs text-neutral-500">
        {isAgent ? "Agent-drafted (editable)" : "You're answering this one"}
      </span>

      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="questionId" value={question.id} />
        <textarea
          name="answerText"
          rows={3}
          defaultValue={question.answerText ?? ""}
          placeholder={
            isAgent ? "Not drafted yet — use “Draft pending answers” above" : "Your answer"
          }
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded border border-neutral-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
        >
          {pending ? "Saving…" : "Save answer"}
        </button>
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      </form>
    </div>
  );
}

export function QuestionList({
  applicationId,
  questions,
}: {
  applicationId: string;
  questions: Question[];
}) {
  const [draftState, draftAction, draftPending] = useActionState(
    draftPendingAnswers,
    initialState,
  );
  const pendingAgentCount = questions.filter(
    (q) => q.answeredBy === "agent" && !q.answerText,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {pendingAgentCount > 0 && (
        <form action={draftAction}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <button
            type="submit"
            disabled={draftPending}
            className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {draftPending
              ? "Drafting…"
              : `Draft ${pendingAgentCount} pending answer${pendingAgentCount === 1 ? "" : "s"}`}
          </button>
          {draftState.error && <p className="text-sm text-red-600">{draftState.error}</p>}
        </form>
      )}

      {questions.length === 0 ? (
        <p className="text-sm text-neutral-500">No questions added yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {questions.map((q) => (
            <QuestionItem key={q.id} applicationId={applicationId} question={q} />
          ))}
        </div>
      )}
    </div>
  );
}

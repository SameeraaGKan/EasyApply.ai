"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ingestFromJobBoard, findMatches, type ActionState } from "./actions";

const initialState: ActionState = { error: null };
const inputClass =
  "rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function IngestForm() {
  const [ingestState, ingestAction, ingestPending] = useActionState(
    ingestFromJobBoard,
    initialState,
  );
  const [matchState, matchAction, matchPending] = useActionState(findMatches, initialState);

  return (
    <div className="flex flex-col gap-4 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Pull in postings from a company</h2>
        <p className="text-sm text-neutral-500">
          Enter a company&apos;s Greenhouse or Lever board token — usually the slug in their
          careers URL (e.g. <code>stripe</code> for boards.greenhouse.io/stripe).
        </p>
        <form action={ingestAction} className="flex gap-2">
          <select name="source" defaultValue="greenhouse" className={inputClass}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
          </select>
          <input
            name="companyToken"
            placeholder="company-token"
            required
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            disabled={ingestPending}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
          >
            {ingestPending ? "Pulling in jobs…" : "Ingest"}
          </button>
        </form>
        {ingestState.error && <p className="text-sm text-red-600">{ingestState.error}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <h2 className="font-medium">Find matches</h2>
        <p className="text-sm text-neutral-500">
          Ranks ingested postings against your active resume — upload one at{" "}
          <Link href="/resume" className="underline">
            /resume
          </Link>{" "}
          first if you haven&apos;t.
        </p>
        <form action={matchAction}>
          <button
            type="submit"
            disabled={matchPending}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {matchPending ? "Matching…" : "Find matches"}
          </button>
        </form>
        {matchState.error && <p className="text-sm text-red-600">{matchState.error}</p>}
      </div>
    </div>
  );
}

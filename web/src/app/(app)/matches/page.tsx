import { getOwnMatches } from "@/lib/dal/matches";
import { IngestForm } from "./ingest-form";
import { updateMatchStatus } from "./actions";

const SCORE_LABELS: Record<string, string> = {
  semanticSimilarity: "Overall fit",
  skillOverlapPct: "Skill match",
  experienceFit: "Experience level",
  locationFit: "Location",
  recency: "Freshness",
};

export default async function MatchesPage() {
  const ownMatches = await getOwnMatches();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Matches</h1>
      <IngestForm />

      {ownMatches.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No matches yet. Ingest some postings and click &quot;Find matches&quot; above.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {ownMatches.map((m) => {
            const breakdown = (m.scoreBreakdown ?? {}) as Record<string, number>;
            return (
              <li
                key={m.id}
                className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <a
                      href={m.descriptionUrl ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                    >
                      {m.title}
                    </a>
                    <p className="text-sm text-neutral-500">
                      {m.companyName}
                      {m.locationText ? ` · ${m.locationText}` : ""}
                      {m.isRemote ? " · Remote" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-neutral-100 px-2 py-1 text-sm font-medium dark:bg-neutral-800">
                    {m.overallScore}%
                  </span>
                </div>

                {m.matchRationale && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {m.matchRationale}
                  </p>
                )}

                <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
                  {Object.entries(breakdown).map(([key, value]) => (
                    <span key={key}>
                      {SCORE_LABELS[key] ?? key}: {Math.round(value * 100)}%
                    </span>
                  ))}
                </div>

                {m.status === "shortlisted" ? (
                  <span className="self-start text-xs font-medium text-green-700 dark:text-green-500">
                    Shortlisted
                  </span>
                ) : (
                  <div className="flex gap-2">
                    <form action={updateMatchStatus.bind(null, m.id, "shortlisted")}>
                      <button
                        type="submit"
                        className="rounded border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700"
                      >
                        Shortlist
                      </button>
                    </form>
                    <form action={updateMatchStatus.bind(null, m.id, "dismissed")}>
                      <button type="submit" className="text-xs text-red-600">
                        Dismiss
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

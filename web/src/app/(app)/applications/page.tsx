import Link from "next/link";
import { getOwnApplications } from "@/lib/dal/applications";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  form_filled_pending_review: "Ready to submit",
  submitted_by_user: "Submitted",
  rejected: "Rejected",
  interviewing: "Interviewing",
  offer: "Offer",
  withdrawn: "Withdrawn",
};

export default async function ApplicationsPage() {
  const apps = await getOwnApplications();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <Link
          href="/applications/new"
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Track a new application
        </Link>
      </div>

      {apps.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing tracked yet. Add an application to start drafting answers and keeping tabs on
          it.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {apps.map((app) => (
            <li key={app.id} className="flex items-center justify-between py-3">
              <Link href={`/applications/${app.id}`} className="flex flex-col">
                <span className="font-medium">{app.roleTitle}</span>
                <span className="text-sm text-neutral-500">{app.companyName}</span>
              </Link>
              <span className="text-sm text-neutral-500">
                {STATUS_LABELS[app.status] ?? app.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

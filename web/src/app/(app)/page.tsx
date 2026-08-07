import Link from "next/link";
import { requireUser } from "@/lib/dal/auth";

export default async function Home() {
  const user = await requireUser();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Signed in as {user.email}. Set up your{" "}
        <Link href="/profile" className="underline">
          profile
        </Link>{" "}
        and upload a{" "}
        <Link href="/resume" className="underline">
          resume
        </Link>{" "}
        to get started. Matching and the application tracker land in upcoming phases.
      </p>
    </main>
  );
}

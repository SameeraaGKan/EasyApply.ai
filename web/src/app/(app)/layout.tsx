import Link from "next/link";
import { requireUser } from "@/lib/dal/auth";
import { signOut } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <nav className="flex gap-4 text-sm font-medium">
            <Link href="/">EasyApply.ai</Link>
            <Link href="/profile" className="text-neutral-500">
              Profile
            </Link>
            <Link href="/resume" className="text-neutral-500">
              Resume
            </Link>
            <Link href="/applications" className="text-neutral-500">
              Applications
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <span>{user.email}</span>
            <form action={signOut}>
              <button type="submit" className="underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-8">{children}</div>
    </div>
  );
}

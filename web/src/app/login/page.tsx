"use client";

import { useActionState } from "react";
import { signIn, signUp, type AuthActionState } from "./actions";

const initialState: AuthActionState = { error: null };

export default function LoginPage() {
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-4">
      <h1 className="text-2xl font-semibold">EasyApply.ai</h1>

      <form action={signInAction} className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Sign in</h2>
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={8}
          className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        {signInState.error && <p className="text-sm text-red-600">{signInState.error}</p>}
        <button
          type="submit"
          disabled={signInPending}
          className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {signInPending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <form action={signUpAction} className="flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">Create an account</h2>
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        <input
          name="password"
          type="password"
          placeholder="Password (min 8 characters)"
          required
          minLength={8}
          className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        {signUpState.error && <p className="text-sm text-red-600">{signUpState.error}</p>}
        <button
          type="submit"
          disabled={signUpPending}
          className="rounded border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700"
        >
          {signUpPending ? "Creating account…" : "Sign up"}
        </button>
      </form>
    </main>
  );
}

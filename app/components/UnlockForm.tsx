"use client";

import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import Logo from "./Logo";

// Asks for the password the event's host put on the link. A right answer registers this device to the event and
// opens the guest app; the unlock cookie (and the event cookie) come back from /api/unlock.
export default function UnlockForm({ slug, eventName }: { slug: string; eventName: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = password.trim();
    if (!trimmed || checking) return;

    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password: trimmed }),
      });
      if (res.ok) {
        // A full navigation, so the page is built with the cookies that were just set.
        window.location.assign("/");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't check the password just now. Try again in a moment.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setChecking(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto overflow-x-hidden bg-background px-6 py-8 text-center text-foreground">
      <Logo className="h-8 w-auto" />

      <span className="mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
        <Lock size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>

      <h1 className="mt-4 w-full min-w-0 break-words text-xl font-semibold">{eventName}</h1>
      <p className="mt-1 max-w-xs text-sm text-gray-500">
        This album is password protected. Enter the password to add and see photos.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex w-full max-w-xs flex-col gap-3" noValidate>
        <label className="sr-only" htmlFor="event-password">
          Password
        </label>
        <input
          id="event-password"
          type="text"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Password"
          maxLength={100}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "event-password-error" : undefined}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-base text-foreground outline-none focus:border-indigo-500"
        />

        {error && (
          <p id="event-password-error" role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!password.trim() || checking}
          className="rounded-full bg-navy-900 px-4 py-3 font-medium text-ivory disabled:opacity-40"
        >
          {checking ? "Checking…" : "Continue"}
        </button>
      </form>

      <p className="mt-6 max-w-xs text-xs text-gray-500">
        It&apos;s on the QR code poster or invitation. Not sure? Ask the host.
      </p>
    </div>
  );
}

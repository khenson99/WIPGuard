"use client";

import { signIn } from "next-auth/react";
import { Shield } from "lucide-react";
import { useState, useEffect } from "react";

interface DevUser {
  id: string;
  name: string;
  email: string;
}

export default function LoginPage() {
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (isDev) {
      fetch("/api/dev/users")
        .then((r) => r.json())
        .then((data) => {
          setDevUsers(data);
          if (data.length > 0) setSelectedEmail(data[0].email);
        })
        .catch(() => {});
    }
  }, [isDev]);

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get(
      "inviteToken"
    );
    if (!inviteToken) return;

    fetch(`/api/team/invite?token=${encodeURIComponent(inviteToken)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.valid && data?.invite?.email) {
          const expiresAt = data.invite.expiresAt
            ? new Date(data.invite.expiresAt).toLocaleString()
            : null;
          setInviteMessage(
            expiresAt
              ? `Invite accepted for ${data.invite.email}. Link expires ${expiresAt}.`
              : `Invite accepted for ${data.invite.email}.`
          );
          setSelectedEmail(data.invite.email);
          return;
        }
        setInviteMessage(data?.error || "Invite link is invalid or expired.");
      })
      .catch(() => {
        setInviteMessage("Invite link is invalid or expired.");
      });
  }, []);

  const handleDevLogin = async () => {
    if (!selectedEmail) return;
    setLoading(true);
    await signIn("credentials", { email: selectedEmail, callbackUrl: "/board" });
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-amber-600/10 ring-1 ring-amber-600/30">
            <Shield className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">WIPGuard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Kanban task management with WIP limits
          </p>
        </div>

        {inviteMessage && (
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            {inviteMessage}
          </div>
        )}

        {/* Google OAuth */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/board" })}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>

        {/* Dev login */}
        {isDev && devUsers.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="text-xs text-zinc-600">DEV MODE</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
            <div className="space-y-3">
              <select
                value={selectedEmail}
                onChange={(e) => setSelectedEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-amber-600"
              >
                {devUsers.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
              <button
                onClick={handleDevLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
              >
                {loading ? "Signing in..." : "Sign in as this user"}
              </button>
            </div>
          </>
        )}

        <p className="text-center text-xs text-zinc-600">
          Your team&apos;s work-in-progress, protected.
        </p>
      </div>
    </div>
  );
}

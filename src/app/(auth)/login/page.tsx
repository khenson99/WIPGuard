"use client";

import Link from "next/link";
import { getProviders, signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";
import { Suspense, useState, useEffect } from "react";

interface DevUser {
  id: string;
  name: string;
  email: string;
}

const authErrors: Record<string, string> = {
  google: "Google sign-in is not configured for this environment.",
  OAuthSignin: "Unable to start OAuth sign-in. Please try again.",
  OAuthCallback: "OAuth callback failed. Please try again.",
  OAuthCreateAccount:
    "Unable to create account from OAuth provider. Please contact support.",
  EmailCreateAccount:
    "Unable to create account from email sign-in. Please contact support.",
  Callback: "Sign-in callback failed. Please try again.",
  OAuthAccountNotLinked:
    "This email is already linked to another sign-in method.",
  EmailSignin: "Email sign-in failed. Please try again.",
  CredentialsSignin:
    "Unable to sign in with that dev account. Check that the user exists.",
  AccessDenied: "Access denied.",
  Verification: "Verification link is invalid or expired.",
  Default: "Unable to sign in. Please try again.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [credentialsEnabled, setCredentialsEnabled] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const isDev =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_E2E_MODE === "true";
  const authError = authErrorCode
    ? (authErrors[authErrorCode] ?? authErrors.Default)
    : null;

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  useEffect(() => {
    getProviders()
      .then((providers) => {
        setGoogleEnabled(Boolean(providers?.google));
        setCredentialsEnabled(Boolean(providers?.credentials));
      })
      .catch(() => {
        setGoogleEnabled(false);
        setCredentialsEnabled(false);
      })
      .finally(() => {
        setLoadingProviders(false);
      });
  }, []);

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
    const error = searchParams?.get("error");
    if (error) {
      Promise.resolve().then(() => setAuthErrorCode(error));
    }
  }, [searchParams]);

  useEffect(() => {
    const inviteToken = searchParams?.get("inviteToken");
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
  }, [searchParams]);

  const handleDevLogin = async () => {
    if (!selectedEmail) return;
    setLoading(true);
    await signIn("credentials", { email: selectedEmail, callbackUrl: "/dashboard" });
    setLoading(false);
  };

  const hasLoginOption =
    googleEnabled || (isDev && credentialsEnabled && devUsers.length > 0);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#efefef] px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(252,90,41,0.18),_transparent_30%),radial-gradient(circle_at_right,_rgba(0,0,0,0.1),_transparent_35%)]" />
      <div className="relative w-full max-w-md space-y-8 rounded-[28px] border border-black/8 bg-white/95 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-black/55 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to product overview
          </Link>

          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Shield className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/45">
              Invite-only access
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              WIPGuard
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sign in to your workspace, orient on the dashboard, then move into
              daily execution. Access is currently limited to Arda GTM and beta teams.
            </p>
          </div>
        </div>

        {inviteMessage && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-foreground">
            {inviteMessage}
          </div>
        )}

        {authError && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground">
            {authError}
          </div>
        )}

        {/* Google OAuth */}
        {googleEnabled && (
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-muted-foreground hover:bg-card"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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
        )}

        {/* Dev login */}
        {isDev && credentialsEnabled && devUsers.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">DEV MODE</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-3">
              <select
                id="dev-user-select"
                aria-label="Select development user"
                value={selectedEmail}
                onChange={(e) => setSelectedEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:border-ring"
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
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {loading ? "Signing in..." : "Sign in as this user"}
              </button>
            </div>
          </>
        )}

        {!loadingProviders && !hasLoginOption && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground">
            No sign-in provider is configured. Add Google OAuth credentials or
            enable a development credentials user.
          </div>
        )}

        <div className="rounded-2xl bg-[#f5f5f5] px-4 py-3 text-xs leading-5 text-muted-foreground">
          Need access? Ask your workspace admin for an invite link or use the
          configured Google account for your team.
        </div>
      </div>
    </div>
  );
}

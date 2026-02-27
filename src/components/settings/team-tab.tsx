"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import {
  Users,
  Mail,
  UserPlus,
  Copy,
  Check,
  Send,
  Save,
  User,
  AlertTriangle,
  X,
} from "lucide-react";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string | null;
  createdAt: string;
}

export function TeamTab() {
  const { data: session, update: updateSession } = useSession();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Profile form
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canInvite = session?.user?.role === "admin";

  const fetchMembers = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/team");
      if (res.ok) {
        setMembers(await res.json());
      }
    } catch (err) {
      setError("Failed to load team members");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (session?.user?.name) {
      setProfileName(session.user.name);
    }
  }, [session?.user?.name]);

  /* ── Clipboard helpers ── */
  const copyInviteLink = async () => {
    try {
      const inviteUrl = `${window.location.origin}/login`;
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  /* ── Invite flow ── */
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteLink(null);
    setInviteError(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setInviteLink(data.inviteUrl);
        setInviteEmail("");
      } else {
        const data = await res.json().catch(() => null);
        setInviteError(data?.error || "Could not create invite link.");
      }
    } catch {
      setInviteError("Could not create invite link.");
    } finally {
      setInviting(false);
    }
  };

  const copyPersonalInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  /* ── Profile save ── */
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileName }),
      });
      if (res.ok) {
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2000);
        await updateSession();
        fetchMembers();
      }
    } catch (err) {
      setError("Failed to save profile");
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setError(null);
                if (error === "Failed to load team members") {
                  setLoading(true);
                  fetchMembers();
                } else {
                  handleSaveProfile();
                }
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
            >
              Retry
            </button>
            <button
              onClick={() => setError(null)}
              className="rounded-md p-1 text-destructive hover:bg-destructive/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Profile section ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <User className="h-4 w-4" />
          <h2 className="text-base font-semibold text-foreground">Your Profile</h2>
        </div>

        <div className="flex items-center gap-5 rounded-lg border border-border bg-card px-5 py-4">
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-full ring-2 ring-border"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-lg font-medium text-muted-foreground ring-2 ring-border">
              {(session?.user?.name || session?.user?.email || "?")[0]?.toUpperCase()}
            </div>
          )}

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                Display Name
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Your name"
                className="flex-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
              />
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile || profileName === session?.user?.name}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {profileSaved ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {session?.user?.email}
            </p>
          </div>
        </div>
      </section>

      {/* ── Team members section ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Team Members
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {members.length} member{members.length !== 1 ? "s" : ""} on your
              team
            </p>
          </div>
          <button
            onClick={copyInviteLink}
            className="btn-primary-theme flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Login Link
              </>
            )}
          </button>
        </div>

        {/* ── Email invite form ── */}
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <UserPlus className="h-4 w-4" />
            Invite by Email
          </div>
          {canInvite ? (
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                placeholder="teammate@company.com"
                className="flex-1 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
              />
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="btn-primary-theme flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {inviting ? "Sending…" : "Invite"}
              </button>
            </div>
          ) : (
            <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              Only admins can generate invite links.
            </p>
          )}

          {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}

          {inviteLink && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2">
              <p className="flex-1 truncate text-xs text-muted-foreground">
                {inviteLink}
              </p>
              <button
                onClick={copyPersonalInvite}
                className="text-xs text-primary hover:text-[var(--primary-hover)]"
              >
                {inviteCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Generates a personal invite link. Email delivery coming in Phase 2.
          </p>
        </div>

        {/* ── Info box ── */}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            New team members join by signing in with Google OAuth. All
            authenticated users are automatically added to the team.
          </p>
        </div>

        {/* ── Members list ── */}
        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No team members yet</p>
            <p className="text-xs text-muted-foreground">
              Share the invite link to get your team started
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
              >
                {member.image ? (
                  <Image
                    src={member.image}
                    alt={member.name || ""}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-medium text-muted-foreground">
                    {(member.name || member.email)[0]?.toUpperCase()}
                  </div>
                )}

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {member.name || "Unnamed"}
                    </span>
                    {member.id === session?.user?.id && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        You
                      </span>
                    )}
                    {member.role && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        {member.role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>

                <span className="text-xs text-muted-foreground">
                  Joined {formatDate(member.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

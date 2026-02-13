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
  const canInvite = session?.user?.role === "admin";

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/team");
      if (res.ok) {
        setMembers(await res.json());
      }
    } catch {
      // Silently handle
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
    } catch {
      // silently handle
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* ── Profile section ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-zinc-300">
          <User className="h-4 w-4" />
          <h2 className="text-base font-semibold text-white">Your Profile</h2>
        </div>

        <div className="flex items-center gap-5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-4">
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-full ring-2 ring-zinc-700"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-medium text-zinc-400 ring-2 ring-zinc-700">
              {(session?.user?.name || session?.user?.email || "?")[0]?.toUpperCase()}
            </div>
          )}

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-zinc-500">
                Display Name
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Your name"
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-600 focus:outline-none"
              />
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile || profileName === session?.user?.name}
                className="flex items-center gap-1.5 rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {profileSaved ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-400" />
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
            <p className="text-xs text-zinc-600">
              {session?.user?.email}
            </p>
          </div>
        </div>
      </section>

      {/* ── Team members section ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">
              Team Members
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {members.length} member{members.length !== 1 ? "s" : ""} on your
              team
            </p>
          </div>
          <button
            onClick={copyInviteLink}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
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
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
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
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-600 focus:outline-none"
              />
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {inviting ? "Sending…" : "Invite"}
              </button>
            </div>
          ) : (
            <p className="rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
              Only admins can generate invite links.
            </p>
          )}

          {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}

          {inviteLink && (
            <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2">
              <p className="flex-1 truncate text-xs text-zinc-400">
                {inviteLink}
              </p>
              <button
                onClick={copyPersonalInvite}
                className="text-xs text-amber-500 hover:text-amber-400"
              >
                {inviteCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}

          <p className="text-[10px] text-zinc-600">
            Generates a personal invite link. Email delivery coming in Phase 2.
          </p>
        </div>

        {/* ── Info box ── */}
        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
          <Mail className="mt-0.5 h-4 w-4 text-zinc-500" />
          <p className="text-xs text-zinc-500">
            New team members join by signing in with Google OAuth. All
            authenticated users are automatically added to the team.
          </p>
        </div>

        {/* ── Members list ── */}
        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 py-12 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">No team members yet</p>
            <p className="text-xs text-zinc-600">
              Share the invite link to get your team started
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
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
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-400">
                    {(member.name || member.email)[0]?.toUpperCase()}
                  </div>
                )}

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">
                      {member.name || "Unnamed"}
                    </span>
                    {member.id === session?.user?.id && (
                      <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] text-amber-400">
                        You
                      </span>
                    )}
                    {member.role && (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                        {member.role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{member.email}</p>
                </div>

                <span className="text-xs text-zinc-600">
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

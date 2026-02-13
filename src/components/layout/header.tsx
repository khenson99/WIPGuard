"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, Bell } from "lucide-react";

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6">
      <div />

      <div className="flex items-center gap-4">
        <button className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
          <Bell className="h-4 w-4" />
        </button>

        {session?.user && (
          <div className="flex items-center gap-3">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="h-7 w-7 rounded-full"
              />
            )}
            <span className="text-sm text-zinc-300">
              {session.user.name}
            </span>
            <button
              onClick={() => signOut()}
              className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

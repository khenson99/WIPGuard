"use client";

import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { LogOut, Bell, Moon, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar-bg px-6">
      <div />

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="icon-btn-sidebar rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <SunMedium className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}

        {/* Notifications */}
        <button
          className="icon-btn-sidebar rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </button>

        {session?.user && (
          <div className="flex items-center gap-3 ml-2">
            {session.user.image && (
              <Image
                src={session.user.image}
                alt={`${session.user.name || "User"} avatar`}
                width={28}
                height={28}
                className="h-7 w-7 rounded-full"
              />
            )}
            <span className="text-sm text-sidebar-foreground">
              {session.user.name}
            </span>
            <button
              onClick={() => signOut()}
              className="icon-btn-sidebar rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

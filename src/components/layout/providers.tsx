"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Suspense, type ReactNode } from "react";
import { FunnelTracker } from "@/components/layout/funnel-tracker";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light">
        <Suspense fallback={null}>
          <FunnelTracker />
        </Suspense>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}

"use client";

import { useEffect, useRef } from "react";
import {
  usePathname,
  useSearchParams,
} from "next/navigation";
import { useSession } from "next-auth/react";
import {
  collectClientFunnelEvent,
  getOrCreateAnonymousId,
  getOrCreateBrowserSessionId,
  markAuthTracked,
  wasAuthTracked,
} from "@/lib/tracking/visitor-funnel";

export function FunnelTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const sessionUser = session?.user as
    | { id?: string | null; email?: string | null }
    | undefined;
  const pageKeyRef = useRef<string | null>(null);
  const sessionTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    getOrCreateAnonymousId();
    const sessionId = getOrCreateBrowserSessionId();
    if (sessionTrackedRef.current === sessionId) return;
    sessionTrackedRef.current = sessionId;

    void collectClientFunnelEvent({
      eventType: "SESSION_STARTED",
      path: currentPath(pathname, searchParams),
      dedupeKey: `session_started:${sessionId}`,
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    const pageKey = currentPath(pathname, searchParams);
    if (pageKeyRef.current === pageKey) return;
    pageKeyRef.current = pageKey;

    void collectClientFunnelEvent({
      eventType: "PAGE_VIEW",
      path: pageKey,
      userId: typeof sessionUser?.id === "string" ? sessionUser.id : null,
      email: typeof sessionUser?.email === "string" ? sessionUser.email : null,
      dedupeKey: `page_view:${getOrCreateBrowserSessionId()}:${pageKey}`,
    });
  }, [pathname, searchParams, sessionUser?.email, sessionUser?.id]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const userId = typeof sessionUser?.id === "string" ? sessionUser.id : null;
    if (!userId || wasAuthTracked(userId)) return;

    const email = typeof sessionUser?.email === "string" ? sessionUser.email : null;
    markAuthTracked(userId);
    void collectClientFunnelEvent({
      eventType: "AUTH_COMPLETED",
      path: currentPath(pathname, searchParams),
      userId,
      email,
      dedupeKey: `auth_completed:${getOrCreateBrowserSessionId()}:${userId}`,
    });
  }, [pathname, searchParams, sessionUser?.email, sessionUser?.id, status]);

  return null;
}

function currentPath(
  pathname: string | null,
  searchParams: { toString(): string } | null,
): string {
  const base = pathname || "/";
  const query = searchParams?.toString();
  return query ? `${base}?${query}` : base;
}

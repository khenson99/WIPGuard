import type { ProspectStatus } from "@/generated/prisma/client";

// ── Evidence ─────────────────────────────────────────────────────────────────

export interface KanbanEvidence {
  url: string;
  snippet: string;
  confidence: number; // 0..1
}

// ── Raw prospect from any data source ────────────────────────────────────────

export interface RawProspect {
  companyName: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  employeeCount: number | null;
  kanbanEvidence: KanbanEvidence[];
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  sourceType: "google_cse" | "website_scrape" | "directory";
  sourceUrl: string;
  metadata?: Record<string, unknown>;
}

// ── Discovery job config ─────────────────────────────────────────────────────

export interface DiscoveryJobConfig {
  userId: string;
  /** Max prospects to discover in a single run */
  maxResults?: number;
  /** Which sources to run */
  sources?: Array<"google_cse" | "website_scrape" | "directory">;
}

// ── Push result ──────────────────────────────────────────────────────────────

export interface PushResult {
  prospectId: string;
  companyName: string;
  domain: string | null;
  status: ProspectStatus;
  hubspotCompanyId: string | null;
  hubspotContactId: string | null;
  error: string | null;
}

// ── Job run summary ──────────────────────────────────────────────────────────

export interface DiscoveryRunSummary {
  discovered: number;
  duplicatesSkipped: number;
  errors: number;
  completedAt: string;
}

export interface PushRunSummary {
  pushed: number;
  skipped: number;
  errors: number;
  results: PushResult[];
  completedAt: string;
}

// ── Status response ──────────────────────────────────────────────────────────

export interface ProspectStats {
  total: number;
  byStatus: Record<string, number>;
  recentDiscoveries: number;
  lastDiscoveryAt: string | null;
  lastPushAt: string | null;
}

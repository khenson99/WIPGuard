/**
 * Changelog generation and formatting.
 *
 * Supports "Keep a Changelog" format as well as Slack-friendly formatting.
 * All logic is pure — no side-effects, no DB calls.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type ChangeCategory =
  | "added"
  | "changed"
  | "deprecated"
  | "removed"
  | "fixed"
  | "security";

export interface ChangeEntry {
  id: string;
  category: ChangeCategory;
  description: string;
  issueRef?: string;
  author?: string;
  breakingChange: boolean;
}

export interface Changelog {
  version: string;
  date: string;
  entries: ChangeEntry[];
  preamble?: string;
}

// ──────────────────────────────────────────────
// Generation
// ──────────────────────────────────────────────

export function generateChangelog(
  version: string,
  entries: ChangeEntry[],
  preamble?: string,
): Changelog {
  return {
    version,
    date: new Date().toISOString().split("T")[0], // YYYY-MM-DD
    entries: [...entries].sort((a, b) => {
      // Sort: breaking first, then by category alphabetically
      if (a.breakingChange !== b.breakingChange) {
        return a.breakingChange ? -1 : 1;
      }
      return a.category.localeCompare(b.category);
    }),
    preamble,
  };
}

// ──────────────────────────────────────────────
// Grouping helper
// ──────────────────────────────────────────────

function groupByCategory(
  entries: ChangeEntry[],
): Record<ChangeCategory, ChangeEntry[]> {
  const groups: Record<ChangeCategory, ChangeEntry[]> = {
    added: [],
    changed: [],
    deprecated: [],
    removed: [],
    fixed: [],
    security: [],
  };
  for (const entry of entries) {
    groups[entry.category].push(entry);
  }
  return groups;
}

// ──────────────────────────────────────────────
// Keep a Changelog Markdown format
// ──────────────────────────────────────────────

const CATEGORY_TITLES: Record<ChangeCategory, string> = {
  added: "Added",
  changed: "Changed",
  deprecated: "Deprecated",
  removed: "Removed",
  fixed: "Fixed",
  security: "Security",
};

function formatEntryMarkdown(entry: ChangeEntry): string {
  let line = `- ${entry.description}`;
  if (entry.breakingChange) line = `- **BREAKING:** ${entry.description}`;
  if (entry.issueRef) line += ` (${entry.issueRef})`;
  if (entry.author) line += ` — @${entry.author}`;
  return line;
}

export function formatAsMarkdown(changelog: Changelog): string {
  const lines: string[] = [];

  lines.push(`## [${changelog.version}] - ${changelog.date}`);
  lines.push("");

  if (changelog.preamble) {
    lines.push(changelog.preamble);
    lines.push("");
  }

  const groups = groupByCategory(changelog.entries);

  for (const category of Object.keys(CATEGORY_TITLES) as ChangeCategory[]) {
    const entries = groups[category];
    if (entries.length === 0) continue;
    lines.push(`### ${CATEGORY_TITLES[category]}`);
    lines.push("");
    for (const entry of entries) {
      lines.push(formatEntryMarkdown(entry));
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// ──────────────────────────────────────────────
// Slack format
// ──────────────────────────────────────────────

const CATEGORY_EMOJI: Record<ChangeCategory, string> = {
  added: ":sparkles:",
  changed: ":arrows_counterclockwise:",
  deprecated: ":warning:",
  removed: ":x:",
  fixed: ":bug:",
  security: ":lock:",
};

function formatEntrySlack(entry: ChangeEntry): string {
  let line = `  ${entry.breakingChange ? ":rotating_light: *BREAKING:* " : ""}${entry.description}`;
  if (entry.issueRef) line += ` (${entry.issueRef})`;
  return line;
}

export function formatForSlack(changelog: Changelog): string {
  const lines: string[] = [];

  lines.push(`*Release ${changelog.version}* — ${changelog.date}`);

  if (changelog.preamble) {
    lines.push(changelog.preamble);
  }

  lines.push("");

  const groups = groupByCategory(changelog.entries);

  for (const category of Object.keys(CATEGORY_EMOJI) as ChangeCategory[]) {
    const entries = groups[category];
    if (entries.length === 0) continue;
    lines.push(
      `${CATEGORY_EMOJI[category]} *${CATEGORY_TITLES[category]}*`,
    );
    for (const entry of entries) {
      lines.push(formatEntrySlack(entry));
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// ──────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────

export function hasBreakingChanges(changelog: Changelog): boolean {
  return changelog.entries.some((e) => e.breakingChange);
}

export function filterByCategory(
  changelog: Changelog,
  category: ChangeCategory,
): ChangeEntry[] {
  return changelog.entries.filter((e) => e.category === category);
}

export function entrySummary(changelog: Changelog): Record<ChangeCategory, number> {
  const groups = groupByCategory(changelog.entries);
  const result = {} as Record<ChangeCategory, number>;
  for (const [cat, entries] of Object.entries(groups)) {
    result[cat as ChangeCategory] = entries.length;
  }
  return result;
}

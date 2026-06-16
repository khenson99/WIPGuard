/**
 * Loads ImladrisMetricLineage for a small set of "winner" canonical metric
 * rows (the latest row per metric key) via a second, id-bounded query.
 *
 * Dashboard readers fetch the full canonical history to pick winners, but must
 * NOT eagerly `include: { lineage }` on that history query: the lineage table
 * holds millions of rows across historical metric values, and including it
 * pulled the entire set through pgsql_tmp, exhausting the Postgres volume and
 * stalling connection establishment (production incident 2026-06-11).
 *
 * This helper instead loads lineage only for the winning rows — a query bounded
 * by primary key to ~one row per metric — and mutates each winner's `lineage`
 * field in place.
 */

interface LineageBearingRow {
  id: string;
  lineage?: unknown[];
}

interface CanonicalLineageDelegate {
  findMany(args: {
    where: { id: { in: string[] } };
    include: { lineage: { orderBy: Array<Record<string, "asc" | "desc">> } };
  }): Promise<Array<{ id: string; lineage?: unknown[] }>>;
}

/**
 * Mutates `winners[*].lineage` in place with lineage loaded from a bounded,
 * id-scoped query. No-op when there are no winners.
 */
export async function attachWinnerLineage(
  prisma: { imladrisCanonicalMetricValue: CanonicalLineageDelegate },
  winners: LineageBearingRow[],
): Promise<void> {
  const winnerIds = winners
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (winnerIds.length === 0) return;

  const rowsWithLineage = await prisma.imladrisCanonicalMetricValue.findMany({
    where: { id: { in: winnerIds } },
    include: { lineage: { orderBy: [{ createdAt: "asc" }] } },
  });

  const lineageById = new Map<string, unknown[]>(
    rowsWithLineage.map((row) => [row.id, row.lineage ?? []]),
  );
  for (const winner of winners) {
    winner.lineage = lineageById.get(winner.id) ?? [];
  }
}

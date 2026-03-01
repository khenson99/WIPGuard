-- Deduplicate existing snapshots so we can enforce bounded storage.
-- Keep the most recent row per (userId, providerKey, contextKey, rangePreset, toDate, status).
DELETE FROM "AnalyticsSnapshot"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "userId", "providerKey", "contextKey", "rangePreset", "toDate", "status"
        ORDER BY "capturedAt" DESC, "createdAt" DESC, "id" DESC
      ) AS rn
    FROM "AnalyticsSnapshot"
  ) t
  WHERE t.rn > 1
);

-- Enforce one SUCCESS row and one ERROR row per key.
CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsSnapshot_userId_providerKey_contextKey_rangePreset_toDate_status_key"
ON "AnalyticsSnapshot"("userId", "providerKey", "contextKey", "rangePreset", "toDate", "status");

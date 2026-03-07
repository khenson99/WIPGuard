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
CREATE UNIQUE INDEX "AnalyticsSnapshot_uniq_key_status"
ON "AnalyticsSnapshot"("userId", "providerKey", "contextKey", "rangePreset", "toDate", "status");

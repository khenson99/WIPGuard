ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'META_ADS';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'META_PAGE';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'PYLON';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'IntegrationProvider' AND e.enumlabel = 'META'
  ) THEN
    INSERT INTO "IntegrationConnection" (
      "id",
      "userId",
      "provider",
      "status",
      "providerAccountId",
      "accountLabel",
      "scopes",
      "accessToken",
      "refreshToken",
      "tokenType",
      "expiresAt",
      "connectedAt",
      "lastSyncedAt",
      "lastError",
      "metadata",
      "createdAt",
      "updatedAt"
    )
    SELECT
      CONCAT('metaads_', SUBSTR(MD5(ic."id" || clock_timestamp()::text), 1, 24)),
      ic."userId",
      'META_ADS'::"IntegrationProvider",
      ic."status",
      ic."providerAccountId",
      ic."accountLabel",
      ic."scopes",
      ic."accessToken",
      ic."refreshToken",
      ic."tokenType",
      ic."expiresAt",
      ic."connectedAt",
      ic."lastSyncedAt",
      ic."lastError",
      ic."metadata",
      ic."createdAt",
      NOW()
    FROM "IntegrationConnection" ic
    WHERE ic."provider"::text = 'META'
    ON CONFLICT ("userId", "provider")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "providerAccountId" = EXCLUDED."providerAccountId",
      "accountLabel" = EXCLUDED."accountLabel",
      "scopes" = EXCLUDED."scopes",
      "accessToken" = EXCLUDED."accessToken",
      "refreshToken" = EXCLUDED."refreshToken",
      "tokenType" = EXCLUDED."tokenType",
      "expiresAt" = EXCLUDED."expiresAt",
      "connectedAt" = EXCLUDED."connectedAt",
      "lastSyncedAt" = EXCLUDED."lastSyncedAt",
      "lastError" = EXCLUDED."lastError",
      "metadata" = EXCLUDED."metadata",
      "updatedAt" = NOW();

    INSERT INTO "IntegrationConnection" (
      "id",
      "userId",
      "provider",
      "status",
      "providerAccountId",
      "accountLabel",
      "scopes",
      "accessToken",
      "refreshToken",
      "tokenType",
      "expiresAt",
      "connectedAt",
      "lastSyncedAt",
      "lastError",
      "metadata",
      "createdAt",
      "updatedAt"
    )
    SELECT
      CONCAT('metapage_', SUBSTR(MD5(ic."id" || clock_timestamp()::text), 1, 24)),
      ic."userId",
      'META_PAGE'::"IntegrationProvider",
      ic."status",
      ic."providerAccountId",
      ic."accountLabel",
      ic."scopes",
      ic."accessToken",
      ic."refreshToken",
      ic."tokenType",
      ic."expiresAt",
      ic."connectedAt",
      ic."lastSyncedAt",
      ic."lastError",
      ic."metadata",
      ic."createdAt",
      NOW()
    FROM "IntegrationConnection" ic
    WHERE ic."provider"::text = 'META'
    ON CONFLICT ("userId", "provider")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "providerAccountId" = EXCLUDED."providerAccountId",
      "accountLabel" = EXCLUDED."accountLabel",
      "scopes" = EXCLUDED."scopes",
      "accessToken" = EXCLUDED."accessToken",
      "refreshToken" = EXCLUDED."refreshToken",
      "tokenType" = EXCLUDED."tokenType",
      "expiresAt" = EXCLUDED."expiresAt",
      "connectedAt" = EXCLUDED."connectedAt",
      "lastSyncedAt" = EXCLUDED."lastSyncedAt",
      "lastError" = EXCLUDED."lastError",
      "metadata" = EXCLUDED."metadata",
      "updatedAt" = NOW();

    INSERT INTO "IntegrationRule" (
      "id",
      "userId",
      "provider",
      "key",
      "enabled",
      "statusOverride",
      "config",
      "checkpoint",
      "lastObservedAt",
      "lastRunAt",
      "lastError",
      "createdAt",
      "updatedAt"
    )
    SELECT
      CONCAT('metaadsrule_', SUBSTR(MD5(ir."id" || clock_timestamp()::text), 1, 24)),
      ir."userId",
      'META_ADS'::"IntegrationProvider",
      ir."key",
      ir."enabled",
      ir."statusOverride",
      ir."config",
      ir."checkpoint",
      ir."lastObservedAt",
      ir."lastRunAt",
      ir."lastError",
      ir."createdAt",
      NOW()
    FROM "IntegrationRule" ir
    WHERE
      ir."provider"::text = 'META'
      AND ir."key" NOT IN ('meta_page_metrics_pull', 'meta_instagram_metrics_pull')
    ON CONFLICT ("userId", "provider", "key")
    DO UPDATE SET
      "enabled" = EXCLUDED."enabled",
      "statusOverride" = EXCLUDED."statusOverride",
      "config" = EXCLUDED."config",
      "checkpoint" = EXCLUDED."checkpoint",
      "lastObservedAt" = EXCLUDED."lastObservedAt",
      "lastRunAt" = EXCLUDED."lastRunAt",
      "lastError" = EXCLUDED."lastError",
      "updatedAt" = NOW();

    INSERT INTO "IntegrationRule" (
      "id",
      "userId",
      "provider",
      "key",
      "enabled",
      "statusOverride",
      "config",
      "checkpoint",
      "lastObservedAt",
      "lastRunAt",
      "lastError",
      "createdAt",
      "updatedAt"
    )
    SELECT
      CONCAT('metapagerule_', SUBSTR(MD5(ir."id" || clock_timestamp()::text), 1, 24)),
      ir."userId",
      'META_PAGE'::"IntegrationProvider",
      ir."key",
      ir."enabled",
      ir."statusOverride",
      ir."config",
      ir."checkpoint",
      ir."lastObservedAt",
      ir."lastRunAt",
      ir."lastError",
      ir."createdAt",
      NOW()
    FROM "IntegrationRule" ir
    WHERE
      ir."provider"::text = 'META'
      AND ir."key" IN ('meta_page_metrics_pull', 'meta_instagram_metrics_pull')
    ON CONFLICT ("userId", "provider", "key")
    DO UPDATE SET
      "enabled" = EXCLUDED."enabled",
      "statusOverride" = EXCLUDED."statusOverride",
      "config" = EXCLUDED."config",
      "checkpoint" = EXCLUDED."checkpoint",
      "lastObservedAt" = EXCLUDED."lastObservedAt",
      "lastRunAt" = EXCLUDED."lastRunAt",
      "lastError" = EXCLUDED."lastError",
      "updatedAt" = NOW();

    UPDATE "WorkflowTriggerCursor"
    SET
      "provider" = 'META_ADS'::"IntegrationProvider",
      "updatedAt" = NOW()
    WHERE "provider"::text = 'META';

    UPDATE "WorkflowTriggerEvent"
    SET
      "provider" =
        CASE
          WHEN LOWER(COALESCE("eventType", '')) LIKE '%page%' OR LOWER(COALESCE("eventType", '')) LIKE '%instagram%'
            THEN 'META_PAGE'::"IntegrationProvider"
          ELSE 'META_ADS'::"IntegrationProvider"
        END,
      "updatedAt" = NOW()
    WHERE "provider"::text = 'META';

    UPDATE "WorkflowRun"
    SET
      "triggerProvider" =
        CASE
          WHEN LOWER(COALESCE("triggerType", '')) LIKE '%page%' OR LOWER(COALESCE("triggerType", '')) LIKE '%instagram%'
            THEN 'META_PAGE'::"IntegrationProvider"
          ELSE 'META_ADS'::"IntegrationProvider"
        END,
      "updatedAt" = NOW()
    WHERE "triggerProvider"::text = 'META';

    UPDATE "WorkflowDefinition"
    SET
      "providers" = ARRAY(
        SELECT DISTINCT
          CASE
            WHEN provider_item::text = 'META'
              THEN 'META_ADS'::"IntegrationProvider"
            ELSE provider_item
          END
        FROM UNNEST("providers") AS provider_item
      ),
      "updatedAt" = NOW()
    WHERE EXISTS (
      SELECT 1
      FROM UNNEST("providers") AS provider_item
      WHERE provider_item::text = 'META'
    );

    DELETE FROM "IntegrationRule"
    WHERE "provider"::text = 'META';

    DELETE FROM "IntegrationConnection"
    WHERE "provider"::text = 'META';
  END IF;
END $$;

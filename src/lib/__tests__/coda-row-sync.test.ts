import { describe, expect, it } from "vitest";
import {
  buildCodaRowDedupeKey,
  defaultCodaRowSyncConfig,
} from "@/lib/integrations/coda-row-sync";

describe("coda-row-sync helpers", () => {
  it("returns default config", () => {
    const config = defaultCodaRowSyncConfig();

    expect(config.titleColumn).toBe("title");
    expect(config.notesColumn).toBe("notes");
    expect(config.maxRows).toBe(100);
  });

  it("builds canonical dedupe key", () => {
    expect(buildCodaRowDedupeKey("i-abc123")).toBe("coda:coda_row:i-abc123:upsert");
  });
});

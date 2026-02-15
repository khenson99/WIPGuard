import { describe, expect, it } from "vitest";
import {
  buildCodaDependencyGateDedupeKey,
  defaultCodaDependencyGateConfig,
} from "@/lib/integrations/coda-dependency-gates";

describe("coda-dependency-gates helpers", () => {
  it("returns default dependency gate config", () => {
    const config = defaultCodaDependencyGateConfig();

    expect(config.taskIdColumn).toBe("taskId");
    expect(config.gateStatusColumn).toBe("gateStatus");
    expect(config.prerequisiteColumn).toBe("prerequisitesComplete");
    expect(config.advanceToStatus).toBe("ACTIVE");
    expect(config.blockedToStatus).toBe("NOT_DONE");
  });

  it("builds canonical dedupe key", () => {
    const key = buildCodaDependencyGateDedupeKey({
      externalObjectId: "i-abc123:taskxyz",
      ruleVariant: "block:NOT_DONE:failed:1700000000000",
    });

    expect(key).toBe(
      "coda:coda_dependency_gate:i-abc123:taskxyz:block:NOT_DONE:failed:1700000000000"
    );
  });
});

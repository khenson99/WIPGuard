import { describe, expect, it } from "vitest";
import {
  buildCodaDecisionDedupeKey,
  defaultCodaDecisionConfig,
} from "@/lib/integrations/coda-decision-actions";

describe("coda-decision-actions helpers", () => {
  it("returns default decision/action config", () => {
    const config = defaultCodaDecisionConfig();

    expect(config.actionColumn).toBe("action");
    expect(config.decisionColumn).toBe("decision");
    expect(config.contextColumn).toBe("context");
    expect(config.maxRows).toBe(100);
  });

  it("builds canonical dedupe key", () => {
    const key = buildCodaDecisionDedupeKey("i-abc123", 2);

    expect(key).toBe("coda:coda_decision_action:i-abc123:2:create");
  });
});

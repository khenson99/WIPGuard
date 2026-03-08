import { describe, expect, it } from "vitest";
import { validateWorkflowGraph } from "@/lib/automations/graph";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";

describe("automations graph", () => {
  it("rejects graphs with cycles", () => {
    const result = validateWorkflowGraph({
      nodes: [
        { key: "trigger_1", type: "TRIGGER", label: "Trigger" },
        { key: "action_1", type: "ACTION", label: "Action" },
      ],
      edges: [
        { source: "trigger_1", target: "action_1" },
        { source: "action_1", target: "trigger_1" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("cycle"))).toBe(true);
  });

  it("requires exactly one trigger node", () => {
    const result = validateWorkflowGraph({
      nodes: [{ key: "action_1", type: "ACTION", label: "Action" }],
      edges: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Graph must include exactly one trigger node.");
  });

  it("includes templates for all connected providers", () => {
    const providers = new Set(
      AUTOMATION_TEMPLATES.flatMap((template) => template.providers)
    );

    expect(providers.has("GOOGLE_WORKSPACE")).toBe(true);
    expect(providers.has("HUBSPOT")).toBe(true);
    expect(providers.has("SLACK")).toBe(true);
    expect(providers.has("CODA")).toBe(true);
    expect(providers.has("REDDIT")).toBe(true);
    expect(providers.has("WIPGUARD")).toBe(true);
    expect(providers.has("GOOGLE_SEARCH_CONSOLE")).toBe(true);
  });

  it("includes the hubspot demo follow-up template referenced by analytics insights", () => {
    expect(
      AUTOMATION_TEMPLATES.some(
        (template) => template.key === "hubspot-demo-followup"
      )
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  renderRetentionIdentityGapsMarkdown,
  type RetentionIdentityGapsReport,
} from "@/lib/retention/reporting";

describe("retention reporting", () => {
  it("renders a readable markdown report for unresolved identity gaps", () => {
    const report: RetentionIdentityGapsReport = {
      generatedAt: "2026-03-13T12:00:00.000Z",
      organizationId: "org_1",
      summary: {
        unresolvedRecords: 3,
        unresolvedBuckets: 1,
        sourcesImpacted: 1,
      },
      buckets: [
        {
          source: "CODA",
          objectType: "master_order_archive",
          unresolvedRecords: 3,
          examples: [
            {
              source: "CODA",
              objectType: "master_order_archive",
              externalId: "row_1",
              tenantKey: "tenant_1",
              occurredAt: "2026-03-01T00:00:00.000Z",
              candidateName: "Arda Foods",
              candidateDomain: "arda.example",
            },
          ],
        },
      ],
    };

    const markdown = renderRetentionIdentityGapsMarkdown(report);

    expect(markdown).toContain("# Identity Gaps Report");
    expect(markdown).toContain("### CODA / master_order_archive");
    expect(markdown).toContain("row_1");
    expect(markdown).toContain("tenantKey=tenant_1");
    expect(markdown).toContain("domain=arda.example");
  });

  it("renders an empty-state report when there are no unresolved records", () => {
    const report: RetentionIdentityGapsReport = {
      generatedAt: "2026-03-13T12:00:00.000Z",
      organizationId: "org_1",
      summary: {
        unresolvedRecords: 0,
        unresolvedBuckets: 0,
        sourcesImpacted: 0,
      },
      buckets: [],
    };

    const markdown = renderRetentionIdentityGapsMarkdown(report);
    expect(markdown).toContain("No unresolved retention source records were found.");
  });
});

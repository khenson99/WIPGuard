import { describe, expect, it } from "vitest";
import mergeDealsModule from "../../../merge_deals.js";

const {
  MAIN_PIPELINE_ID,
  SUBSCRIPTION_PIPELINE_ID,
  buildCleanupPlan,
} = mergeDealsModule;

describe("HubSpot cleanup planner", () => {
  it("builds the confirmed customer merges and only auto-merges subscription deals on customer match", () => {
    const plan = buildCleanupPlan({
      deals: [
        {
          id: "79658864346",
          name: "Egg Collective - Sales",
          stageId: "closedwon",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-05-09T19:27:53.295Z",
          updatedAt: "2026-03-04T15:59:33.802Z",
          companyIds: ["135151484655"],
          contactIds: ["egg-main"],
        },
        {
          id: "138720011979",
          name: "Egg Collective",
          stageId: "closedlost",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-08-09T18:35:07.264Z",
          updatedAt: "2026-03-04T15:59:33.801Z",
          companyIds: ["135151484655"],
          contactIds: ["egg-dup"],
        },
        {
          id: "79676947156",
          name: "Lichen Precision - Sales",
          stageId: "closedwon",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-05-09T19:21:16.160Z",
          updatedAt: "2026-02-24T10:31:45.083Z",
          companyIds: ["79299898053"],
          contactIds: ["lichen-main"],
        },
        {
          id: "139322884826",
          name: "Lichen Precision",
          stageId: "closedlost",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-08-09T18:35:06.462Z",
          updatedAt: "2026-02-19T19:46:33.423Z",
          companyIds: ["79299898053"],
          contactIds: ["lichen-main"],
        },
        {
          id: "79675150072",
          name: "Super Pacific - Sales",
          stageId: "closedwon",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-05-09T19:21:48.243Z",
          updatedAt: "2026-02-27T18:01:33.650Z",
          companyIds: ["76096495311"],
          contactIds: ["super-main"],
        },
        {
          id: "139080299207",
          name: "Super Pacific",
          stageId: "closedlost",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-08-09T18:35:07.065Z",
          updatedAt: "2026-02-27T18:01:35.108Z",
          companyIds: ["76096495311"],
          contactIds: ["super-secondary-a"],
        },
        {
          id: "304667726544",
          name: "Super Pacific",
          stageId: "closedlost",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-08-09T18:35:06.375Z",
          updatedAt: "2026-02-24T05:25:52.197Z",
          companyIds: ["75923518183"],
          contactIds: ["super-secondary-b"],
        },
        {
          id: "main-domain",
          name: "Oakley Fire - Sales",
          stageId: "closedwon",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-10-01T10:00:00.000Z",
          updatedAt: "2026-03-01T10:00:00.000Z",
          companyIds: ["company-domain-main"],
          contactIds: ["contact-domain-main"],
        },
        {
          id: "main-email",
          name: "Email Match - Sales",
          stageId: "presentationscheduled",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-10-02T10:00:00.000Z",
          updatedAt: "2026-03-02T10:00:00.000Z",
          companyIds: ["company-email-main"],
          contactIds: ["contact-email-main"],
        },
        {
          id: "main-name",
          name: "Same Name Co - Sales",
          stageId: "closedlost",
          pipelineId: MAIN_PIPELINE_ID,
          createdAt: "2025-10-03T10:00:00.000Z",
          updatedAt: "2026-03-03T10:00:00.000Z",
          companyIds: ["company-name-main"],
          contactIds: ["contact-name-main"],
        },
        {
          id: "sub-domain",
          name: "Zaybra Subscription",
          stageId: "2239936224",
          pipelineId: SUBSCRIPTION_PIPELINE_ID,
          createdAt: "2026-02-01T10:00:00.000Z",
          updatedAt: "2026-03-04T10:00:00.000Z",
          companyIds: ["company-domain-sub"],
          contactIds: ["contact-domain-sub"],
        },
        {
          id: "sub-email",
          name: "Zaybra Subscription",
          stageId: "2239936224",
          pipelineId: SUBSCRIPTION_PIPELINE_ID,
          createdAt: "2026-02-02T10:00:00.000Z",
          updatedAt: "2026-03-04T11:00:00.000Z",
          companyIds: ["company-email-sub"],
          contactIds: ["contact-email-main"],
        },
        {
          id: "sub-name",
          name: "Zaybra Subscription",
          stageId: "2239936224",
          pipelineId: SUBSCRIPTION_PIPELINE_ID,
          createdAt: "2026-02-03T10:00:00.000Z",
          updatedAt: "2026-03-04T12:00:00.000Z",
          companyIds: ["company-name-sub"],
          contactIds: ["contact-name-sub"],
        },
        {
          id: "sub-unmatched",
          name: "Zaybra Subscription",
          stageId: "2239936224",
          pipelineId: SUBSCRIPTION_PIPELINE_ID,
          createdAt: "2026-02-04T10:00:00.000Z",
          updatedAt: "2026-03-04T13:00:00.000Z",
          companyIds: ["company-unmatched"],
          contactIds: ["contact-unmatched"],
        },
      ],
      companies: [
        { id: "135151484655", name: "Egg Collective", domain: "eggcollective.com", createdAt: null, updatedAt: null },
        { id: "79299898053", name: "Lichen Precision", domain: "lichenprecision.com", createdAt: null, updatedAt: null },
        { id: "76096495311", name: "Super Pacific USA", domain: "superpacificusa.com", createdAt: null, updatedAt: null },
        { id: "75923518183", name: "Super Pacific USA", domain: "superpacificusa.com", createdAt: null, updatedAt: null },
        { id: "company-domain-main", name: "Oakley Fire", domain: "oakleyfire.com", createdAt: null, updatedAt: null },
        { id: "company-domain-sub", name: "Oakley Fire", domain: "oakleyfire.com", createdAt: null, updatedAt: null },
        { id: "company-email-main", name: "Email Match Company", domain: null, createdAt: null, updatedAt: null },
        { id: "company-email-sub", name: "Email Match Company Duplicate", domain: null, createdAt: null, updatedAt: null },
        { id: "company-name-main", name: "Same Name Co", domain: null, createdAt: null, updatedAt: null },
        { id: "company-name-sub", name: "Same Name Co", domain: null, createdAt: null, updatedAt: null },
        { id: "company-unmatched", name: "Completely Different Co", domain: "different.example", createdAt: null, updatedAt: null },
      ],
      contacts: [
        { id: "egg-main", email: "hello@eggcollective.com" },
        { id: "egg-dup", email: "sales@eggcollective.com" },
        { id: "lichen-main", email: "hello@lichenprecision.com" },
        { id: "super-main", email: "jessica@superpacificusa.com" },
        { id: "super-secondary-a", email: "alt@superpacificusa.com" },
        { id: "super-secondary-b", email: "ops@superpacificusa.com" },
        { id: "contact-domain-main", email: "jacob@oakleyfire.com" },
        { id: "contact-domain-sub", email: "jacob@oakleyfire.com" },
        { id: "contact-email-main", email: "owner@email-match.example" },
        { id: "contact-name-main", email: "owner@same-name.example" },
        { id: "contact-name-sub", email: "other@same-name.example" },
        { id: "contact-unmatched", email: "nobody@different.example" },
      ],
    });

    expect(plan.dealMerges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ primaryObjectId: "79658864346", objectIdToMerge: "138720011979", matchType: "manual" }),
        expect.objectContaining({ primaryObjectId: "79676947156", objectIdToMerge: "139322884826", matchType: "manual" }),
        expect.objectContaining({ primaryObjectId: "79675150072", objectIdToMerge: "139080299207", matchType: "manual" }),
        expect.objectContaining({ primaryObjectId: "79675150072", objectIdToMerge: "304667726544", matchType: "manual" }),
        expect.objectContaining({ primaryObjectId: "main-domain", objectIdToMerge: "sub-domain", matchType: "company_domain" }),
        expect.objectContaining({ primaryObjectId: "main-email", objectIdToMerge: "sub-email", matchType: "contact_email" }),
        expect.objectContaining({ primaryObjectId: "main-name", objectIdToMerge: "sub-name", matchType: "company_name" }),
      ]),
    );

    expect(plan.companyMerges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ primaryObjectId: "76096495311", objectIdToMerge: "75923518183", matchType: "manual" }),
        expect.objectContaining({ primaryObjectId: "company-domain-main", objectIdToMerge: "company-domain-sub", matchType: "company_domain" }),
        expect.objectContaining({ primaryObjectId: "company-email-main", objectIdToMerge: "company-email-sub", matchType: "contact_email" }),
        expect.objectContaining({ primaryObjectId: "company-name-main", objectIdToMerge: "company-name-sub", matchType: "company_name" }),
      ]),
    );

    expect(plan.review).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dealId: "sub-unmatched",
          dealName: "Zaybra Subscription",
        }),
      ]),
    );
  });
});

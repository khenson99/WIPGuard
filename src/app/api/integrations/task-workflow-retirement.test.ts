import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("retired task-oriented integration routes", () => {
  it("returns 410 for task-oriented sync and capture endpoints", async () => {
    const { GET: getCodaRowSync, POST: postCodaRowSync } = await import(
      "@/app/api/integrations/coda/row-sync/route"
    );
    const { GET: getHubSpotSync } = await import("@/app/api/integrations/hubspot/sync/route");
    const { GET: getSlackStatusSync } = await import(
      "@/app/api/integrations/slack/status-sync/route"
    );
    const { POST: postSlackEvents } = await import(
      "@/app/api/integrations/slack/events/route"
    );
    const { POST: postSlackTaskCreate } = await import(
      "@/app/api/integrations/slack/task-create/route"
    );
    const { GET: getPylonIssueSync } = await import(
      "@/app/api/integrations/pylon/issue-task-sync/route"
    );

    const codaGet = await getCodaRowSync();
    const codaPost = await postCodaRowSync(
      new NextRequest("http://localhost/api/integrations/coda/row-sync", { method: "POST" })
    );
    const hubspotGet = await getHubSpotSync();
    const slackGet = await getSlackStatusSync();
    const slackEvents = await postSlackEvents(
      new NextRequest("http://localhost/api/integrations/slack/events", { method: "POST" })
    );
    const slackTaskCreate = await postSlackTaskCreate(
      new NextRequest("http://localhost/api/integrations/slack/task-create", {
        method: "POST",
      })
    );
    const pylonGet = await getPylonIssueSync();

    expect(codaGet.status).toBe(410);
    expect(codaPost.status).toBe(410);
    expect(hubspotGet.status).toBe(410);
    expect(slackGet.status).toBe(410);
    expect(slackEvents.status).toBe(410);
    expect(slackTaskCreate.status).toBe(410);
    expect(pylonGet.status).toBe(410);

    await expect(codaGet.json()).resolves.toEqual({
      error: "Task-oriented integration workflows have been retired with the Work section.",
    });
  });
});

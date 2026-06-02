import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverConnectedUserIds } from "./users";

function createPrismaMock(rows: Array<{ userId: string }>) {
  return {
    integrationConnection: {
      findMany: vi.fn(async () => rows),
    },
  };
}

describe("discoverConnectedUserIds", () => {
  const originalOwnerUserId = process.env.INTEGRATION_OWNER_USER_ID;

  afterEach(() => {
    if (originalOwnerUserId == null) {
      delete process.env.INTEGRATION_OWNER_USER_ID;
    } else {
      process.env.INTEGRATION_OWNER_USER_ID = originalOwnerUserId;
    }
  });

  it("includes the configured integration owner so env-managed integrations still sync", async () => {
    process.env.INTEGRATION_OWNER_USER_ID = "owner_1";

    await expect(
      discoverConnectedUserIds(createPrismaMock([]) as never),
    ).resolves.toEqual(["owner_1"]);
  });

  it("deduplicates the configured integration owner when it also has connection rows", async () => {
    process.env.INTEGRATION_OWNER_USER_ID = "owner_1";

    await expect(
      discoverConnectedUserIds(
        createPrismaMock([{ userId: "owner_1" }, { userId: "user_2" }]) as never,
      ),
    ).resolves.toEqual(["owner_1", "user_2"]);
  });

  it("discovers users with connected or error integrations so scheduled health can recover them", async () => {
    const prisma = createPrismaMock([{ userId: "user_1" }, { userId: "user_2" }]);

    await expect(discoverConnectedUserIds(prisma as never)).resolves.toEqual([
      "user_1",
      "user_2",
    ]);

    expect(prisma.integrationConnection.findMany).toHaveBeenCalledWith({
      distinct: ["userId"],
      where: { status: { in: ["CONNECTED", "ERROR"] } },
      select: { userId: true },
    });
  });
});

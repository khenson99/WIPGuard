import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.integrationConnection.updateMany({
    where: { provider: "PYLON" },
    data: { lastError: null, status: "CONNECTED" },
  });
  console.log("Cleared PYLON errors:", count.count);
}

main().catch(console.error);

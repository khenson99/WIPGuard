import { prisma } from "./src/lib/prisma";
import { protectIntegrationSecret } from "./src/lib/integrations/token-crypto.js";

async function main() {
  const metaConnection = await prisma.integrationConnection.findFirst({
    where: { provider: "META_ADS" as any },
  });

  if (!metaConnection) {
    console.log("No Meta connection found in DB.");
    return;
  }

  const longLivedToken = "EAARmdZA2VDq8BQ4YPiVRpy8q0ZCD4AxVKZCaC7QdvIZATSsBYX2hZA5yT3fRkUf9J4jW9lPWVRvqBZAlJpZA7qRPtULSbPJPtuYxa8DpW3LnFBHMupraC1k1AgtgE28MV4ElxvfXXA1eyksuNIZAyPZAcaZAWSg2I9WkqDQtbDPxa6POPWvz6U9F4cBSJp25wCeAZDZD";

  await prisma.integrationConnection.update({
    where: { id: metaConnection.id },
    data: {
      accessToken: protectIntegrationSecret(longLivedToken),
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      lastError: null,
      status: "CONNECTED"
    },
  });

  console.log("Meta Token updated successfully in DB!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

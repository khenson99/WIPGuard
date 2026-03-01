import { prisma } from '@/lib/prisma'

async function main() {
  const snapshot = await prisma.analyticsSnapshot.findFirst({
    where: { providerKey: 'googleAnalytics' },
    orderBy: { capturedAt: 'desc' }
  })
  console.log(JSON.stringify(snapshot?.payload, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())

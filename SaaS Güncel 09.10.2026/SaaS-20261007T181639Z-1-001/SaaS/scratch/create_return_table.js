const prisma = require('../lib/prisma');

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReturnRequest" (
      "id" TEXT NOT NULL,
      "orderId" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "customerNote" TEXT,
      "status" TEXT NOT NULL DEFAULT 'Bekliyor',
      "adminNote" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ReturnRequest_tenantId_idx" ON "ReturnRequest"("tenantId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ReturnRequest_customerId_idx" ON "ReturnRequest"("customerId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ReturnRequest_status_idx" ON "ReturnRequest"("status")`);

  console.log('ReturnRequest table created successfully!');
  const count = await prisma.returnRequest.count();
  console.log('Current ReturnRequest records:', count);
}

main().catch(console.error).finally(() => prisma.$disconnect());

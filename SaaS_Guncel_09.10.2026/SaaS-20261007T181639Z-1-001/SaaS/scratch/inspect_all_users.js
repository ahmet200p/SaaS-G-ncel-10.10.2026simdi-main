const prisma = require('../backend-api/lib/prisma');

async function inspectAll() {
  const users = await prisma.user.findMany();
  console.log('=== USERS ===');
  users.forEach(u => console.log(`${u.id} | ${u.email} | ${u.name} | ${u.role} | tenant: ${u.tenantId}`));

  const profiles = await prisma.customerProfile.findMany({
    include: { user: true }
  });
  console.log('\n=== CUSTOMER PROFILES ===');
  profiles.forEach(p => console.log(`${p.id} | ${p.companyName} | ${p.phone} | User: ${p.user?.name} (${p.user?.email})`));

  await prisma.$disconnect();
}

inspectAll().catch(console.error);

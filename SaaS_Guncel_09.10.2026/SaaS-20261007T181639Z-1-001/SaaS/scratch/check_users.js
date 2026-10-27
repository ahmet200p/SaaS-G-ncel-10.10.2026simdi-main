const { startServer } = require('../backend-api/dev_pg_server');
const prisma = require('../backend-api/lib/prisma');
const bcrypt = require('bcryptjs');

async function check() {
  await startServer();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      password: true,
      status: true
    }
  });

  console.log('Current users count:', users.length);
  for (const u of users) {
    console.log(`- ${u.email} [${u.role}] (Hash starts with: ${u.password ? u.password.substring(0, 10) : 'null'}...)`);
  }
}

check()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

const { PrismaClient } = require('@prisma/client');

// PrismaClient örneğini tekil (Singleton) olarak yönet
const prisma = new PrismaClient({
  log: process.env.PRISMA_DEBUG === 'true' ? ['query', 'info', 'warn', 'error'] : [],
});

module.exports = prisma;

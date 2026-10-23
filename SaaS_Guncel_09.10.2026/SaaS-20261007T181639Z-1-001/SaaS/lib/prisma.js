const { PrismaClient } = require('@prisma/client');

// PrismaClient örneğini tekil (Singleton) olarak yönet
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

module.exports = prisma;

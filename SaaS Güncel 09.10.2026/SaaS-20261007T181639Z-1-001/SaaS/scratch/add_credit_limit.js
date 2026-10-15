require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../lib/prisma');

async function main() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "CustomerProfile" 
      ADD COLUMN IF NOT EXISTS "creditLimit" DOUBLE PRECISION DEFAULT 50000.0;
    `);
    console.log('Successfully ensured creditLimit column on CustomerProfile table.');
  } catch (err) {
    console.error('Error altering table:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

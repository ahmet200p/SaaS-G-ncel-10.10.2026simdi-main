const prisma = require('../backend-api/lib/prisma');

async function inspectRemaining() {
  const allProducts = await prisma.product.findMany();
  console.log('--- Real Catalog Products ---');
  allProducts.forEach(p => {
    const isTest = (p.name || '').toUpperCase().includes('TEST') || (p.oeNumber || '').toUpperCase().includes('TEST');
    if (!isTest) {
      console.log(`- OE: ${p.oeNumber} | Name: ${p.name} | Category: ${p.category} | Brand: ${p.vehicleBrand}`);
    }
  });
  await prisma.$disconnect();
}

inspectRemaining();

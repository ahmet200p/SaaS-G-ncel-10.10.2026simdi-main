const prisma = require('../backend-api/lib/prisma');

async function inspectProducts() {
  const allProducts = await prisma.product.findMany({
    include: {
      tenantProducts: true
    }
  });

  console.log(`Toplam Ürün Sayısı: ${allProducts.length}`);

  const testProducts = allProducts.filter(p => {
    const nameUpper = (p.name || '').toUpperCase();
    const oeUpper = (p.oeNumber || '').toUpperCase();
    return nameUpper.includes('TEST') || oeUpper.includes('TEST') || oeUpper.includes('PAY-TEST') || nameUpper.includes('PAY-TEST');
  });

  console.log(`Test Ürünü Sayısı: ${testProducts.length}`);
  testProducts.forEach(p => {
    console.log(`- ID: ${p.id} | OE: ${p.oeNumber} | Name: ${p.name} | TenantProducts: ${p.tenantProducts.length}`);
  });

  await prisma.$disconnect();
}

inspectProducts();

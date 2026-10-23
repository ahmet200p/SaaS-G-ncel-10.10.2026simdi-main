const prisma = require('../backend-api/lib/prisma');

async function verifyDb() {
  const allProducts = await prisma.product.findMany();
  const testCount = allProducts.filter(p => {
    const s = ((p.name || '') + ' ' + (p.oeNumber || '')).toUpperCase();
    return s.includes('TEST') || s.includes('PAY-TEST');
  }).length;

  console.log('=== VERİTABANI KONTROLÜ ===');
  console.log(`Toplam Ürün: ${allProducts.length}`);
  console.log(`Test Ürünü: ${testCount}`);
  if (testCount === 0) {
    console.log('✅ Sıfır Test Ürünü! Sadece gerçek katalog ürünleri mevcut.');
  } else {
    console.error('❌ Hala test ürünü var!');
  }

  await prisma.$disconnect();
}

verifyDb();

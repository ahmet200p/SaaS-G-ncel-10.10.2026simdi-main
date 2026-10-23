const prisma = require('../backend-api/lib/prisma');

async function cleanTestProducts() {
  console.log('--- TEST ÜRÜNLERİNİ TEMİZLEME BAŞLADI ---');

  // Case-insensitive 'TEST' araması
  const testProducts = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: 'TEST', mode: 'insensitive' } },
        { oeNumber: { contains: 'TEST', mode: 'insensitive' } },
        { name: { contains: 'PAY-TEST', mode: 'insensitive' } },
        { oeNumber: { contains: 'PAY-TEST', mode: 'insensitive' } }
      ]
    },
    include: {
      tenantProducts: true
    }
  });

  console.log(`Silinecek Test Ürünü Sayısı: ${testProducts.length}`);

  for (const prod of testProducts) {
    console.log(`\nSiliniyor: [${prod.id}] ${prod.oeNumber} - ${prod.name}`);

    for (const tp of prod.tenantProducts) {
      // 1. Bağlı sipariş kalemlerini sil
      const deletedOrderItems = await prisma.orderItem.deleteMany({
        where: { tenantProductId: tp.id }
      });
      if (deletedOrderItems.count > 0) {
        console.log(`  -> ${deletedOrderItems.count} adet OrderItem silindi.`);
      }

      // 2. Bağlı stok hareketlerini sil
      const deletedMovements = await prisma.stockMovement.deleteMany({
        where: { tenantProductId: tp.id }
      });
      if (deletedMovements.count > 0) {
        console.log(`  -> ${deletedMovements.count} adet StockMovement silindi.`);
      }

      // 3. TenantProduct sil
      await prisma.tenantProduct.delete({
        where: { id: tp.id }
      });
      console.log(`  -> TenantProduct (${tp.id}) silindi.`);
    }

    // 4. Product kaydını sil
    await prisma.product.delete({
      where: { id: prod.id }
    });
    console.log(`  -> Ana Product kaydı kalıcı olarak silindi.`);
  }

  // Doğrulama: Kalan ürünleri listele
  const remainingProducts = await prisma.product.findMany({
    select: {
      id: true,
      oeNumber: true,
      name: true,
      category: true,
      vehicleBrand: true
    }
  });

  console.log('\n======================================================');
  console.log(`✅ TEMİZLİK TAMAMLANDI! Veritabanında Kalan Gerçek Ürünler (${remainingProducts.length}):`);
  remainingProducts.forEach((p, idx) => {
    console.log(`${idx + 1}. [${p.oeNumber}] ${p.name} (${p.vehicleBrand || 'Genel'} - ${p.category})`);
  });
  console.log('======================================================');

  await prisma.$disconnect();
}

cleanTestProducts().catch(err => {
  console.error('Hata:', err);
  process.exit(1);
});

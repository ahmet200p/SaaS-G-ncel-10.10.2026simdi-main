const prisma = require('../backend-api/lib/prisma');

async function inspectArda() {
  console.log('--- ARDA / 1111111111 SORGULAMASI ---');

  // 1. CustomerProfiles
  const profiles = await prisma.customerProfile.findMany({
    where: {
      OR: [
        { companyName: { contains: 'arda', mode: 'insensitive' } },
        { phone: { contains: '1111111111' } },
        { user: { name: { contains: 'arda', mode: 'insensitive' } } },
        { user: { email: { contains: 'arda', mode: 'insensitive' } } }
      ]
    },
    include: {
      user: true,
      orders: {
        include: {
          items: true,
          stockMovements: true,
          returnRequests: true
        }
      },
      customerLedgers: true
    }
  });

  console.log(`Bulunan Eşleşen Müşteri Profili Sayısı: ${profiles.length}`);
  profiles.forEach(p => {
    console.log(`\nProfil ID: ${p.id}`);
    console.log(`Firma Adı: ${p.companyName}`);
    console.log(`Telefon: ${p.phone}`);
    console.log(`Kullanıcı: ${p.user?.name} (${p.user?.email})`);
    console.log(`Sipariş Sayısı: ${p.orders.length}`);
    p.orders.forEach(o => {
      console.log(`  -> Sipariş No: ${o.orderNumber} (ID: ${o.id}) | Durum: ${o.status} | Toplam: ${o.totalAmount} | Kalem Sayısı: ${o.items.length}`);
    });
  });

  // 2. Also check all Orders in DB to see if any order has customer phone 1111111111 or arda directly
  const allOrders = await prisma.order.findMany({
    include: {
      customer: {
        include: { user: true }
      },
      items: true
    }
  });

  console.log(`\nToplam Sistemdeki Sipariş Sayısı: ${allOrders.length}`);
  allOrders.forEach(o => {
    console.log(`- Sipariş: ${o.orderNumber} | Müşteri: ${o.customer?.companyName || o.customer?.user?.name} | Tel: ${o.customer?.phone} | Tutar: ${o.totalAmount} ₺ | Durum: ${o.status}`);
  });

  await prisma.$disconnect();
}

inspectArda().catch(err => {
  console.error(err);
  process.exit(1);
});

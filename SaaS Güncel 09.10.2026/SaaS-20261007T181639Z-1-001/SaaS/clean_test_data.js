/**
 * ============================================================================
 * Multi-Tenant B2B Yedek Parça SaaS - Test Verilerini Temizleme Betiği
 * ============================================================================
 * Bu betik:
 * 1. CustomerProfile (Otoservis Müşterileri), Product (Katalog Ürünleri),
 *    DiscountRule (İskonto Kuralları) ve Order (Siparişler) kayıtlarını
 *    ilişkili alt tablolarıyla (OrderItem, StockMovement, CustomerLedger, TenantProduct)
 *    birlikte tamamen siler.
 * 2. Müşteri (CUSTOMER) rolündeki test hesaplarını User tablosundan siler.
 * 3. Yalnızca Süper Admin (admin@sistem.com, ahmet@sistem.com) ve
 *    Bayi Yöneticisi (ahmet@ahmetoto.com) yetkili hesaplarını korur / eksikse oluşturur.
 */

const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function cleanTestData() {
  console.log('====================================================');
  console.log('🧹 1. ADIM: Test Verilerini Temizleme Başlatılıyor...');
  console.log('====================================================');

  try {
    // 1. Sipariş ve Stok Hareketleri
    const deletedOrderItems = await prisma.orderItem.deleteMany({});
    console.log(`🗑️  Silinen Sipariş Kalemleri (OrderItem): ${deletedOrderItems.count}`);

    const deletedStockMovements = await prisma.stockMovement.deleteMany({});
    console.log(`🗑️  Silinen Stok Hareketleri (StockMovement): ${deletedStockMovements.count}`);

    const deletedOrders = await prisma.order.deleteMany({});
    console.log(`🗑️  Silinen Siparişler (Order): ${deletedOrders.count}`);

    // 2. Müşteri Cari Defteri ve Profilleri
    const deletedLedgers = await prisma.customerLedger.deleteMany({});
    console.log(`🗑️  Silinen Cari Defter Kayıtları (CustomerLedger): ${deletedLedgers.count}`);

    const deletedProfiles = await prisma.customerProfile.deleteMany({});
    console.log(`🗑️  Silinen Otoservis Müşteri Profilleri (CustomerProfile): ${deletedProfiles.count}`);

    // 3. İskonto Kuralları
    const deletedDiscountRules = await prisma.discountRule.deleteMany({});
    console.log(`🗑️  Silinen İskonto Kuralları (DiscountRule): ${deletedDiscountRules.count}`);

    // 4. Katalog ve Ürünler
    const deletedTenantProducts = await prisma.tenantProduct.deleteMany({});
    console.log(`🗑️  Silinen Bayi Ürünleri (TenantProduct): ${deletedTenantProducts.count}`);

    const deletedProducts = await prisma.product.deleteMany({});
    console.log(`🗑️  Silinen Merkezi Parçalar (Product): ${deletedProducts.count}`);

    // 5. Test Müşteri Kullanıcıları (CUSTOMER rolü)
    const deletedCustomerUsers = await prisma.user.deleteMany({
      where: { role: 'CUSTOMER' }
    });
    console.log(`🗑️  Silinen Test Müşteri Hesapları (User - CUSTOMER): ${deletedCustomerUsers.count}`);

    // 6. Bayi (Ahmet Oto) ve Yetkili Kullanıcıların Bütünlüğünü Sağlama (.env üzerinden)
    const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD || 'SaaS_Super_Admin_2026!#Secure';
    const hashedPassword = await bcrypt.hash(adminPass, 10);

    // 6.a Süper Admin
    const superAdmin = await prisma.user.upsert({
      where: { email: 'admin@sistem.com' },
      update: {
        password: hashedPassword,
        role: 'SUPER_ADMIN'
      },
      create: {
        email: 'admin@sistem.com',
        password: hashedPassword,
        role: 'SUPER_ADMIN'
      }
    });
    console.log(`👑 Süper Admin korundu / oluşturuldu: ${superAdmin.email}`);

    // 6.b Ahmet Oto Bayi (Tenant)
    const tenant = await prisma.tenant.upsert({
      where: { subdomain: 'ahmetoto' },
      update: {
        name: 'Ahmet Oto',
        themeColor: '#f97316',
        isActive: true
      },
      create: {
        name: 'Ahmet Oto',
        subdomain: 'ahmetoto',
        themeColor: '#f97316',
        isActive: true
      }
    });
    console.log(`🏪 Bayi (Tenant) korundu / oluşturuldu: ${tenant.name} (${tenant.subdomain})`);

    // 6.c Bayi Yöneticisi (TENANT_ADMIN)
    const tenantAdmin = await prisma.user.upsert({
      where: { email: 'ahmet@ahmetoto.com' },
      update: {
        password: hashedPassword,
        role: 'TENANT_ADMIN',
        tenantId: tenant.id
      },
      create: {
        email: 'ahmet@ahmetoto.com',
        password: hashedPassword,
        role: 'TENANT_ADMIN',
        tenantId: tenant.id
      }
    });
    console.log(`👔 Bayi Yöneticisi korundu / oluşturuldu: ${tenantAdmin.email}`);

    // 7. Nihai Tablo Sayım Raporu
    console.log('\n----------------------------------------------------');
    console.log('📊 GÜNCEL VERİTABANI DURUMU (ORGANİK / TEST VERİSİ SIFIRLANDI):');
    console.log(`- Toplam User (Sadece Admin & Bayi Yetkilileri): ${await prisma.user.count()}`);
    console.log(`- Toplam Tenant: ${await prisma.tenant.count()}`);
    console.log(`- Toplam CustomerProfile: ${await prisma.customerProfile.count()}`);
    console.log(`- Toplam Product: ${await prisma.product.count()}`);
    console.log(`- Toplam TenantProduct: ${await prisma.tenantProduct.count()}`);
    console.log(`- Toplam DiscountRule: ${await prisma.discountRule.count()}`);
    console.log(`- Toplam Order: ${await prisma.order.count()}`);
    console.log('----------------------------------------------------');
    console.log('✨ Veritabanı başarıyla organik ve temiz duruma getirildi!');
  } catch (error) {
    console.error('❌ Temizleme sırasında hata oluştu:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanTestData();

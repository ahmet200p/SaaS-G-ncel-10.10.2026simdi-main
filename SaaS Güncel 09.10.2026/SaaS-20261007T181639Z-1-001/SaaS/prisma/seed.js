/**
 * ============================================================================
 * Multi-Tenant B2B Yedek Parça SaaS - Prisma Tohumlama Betiği (prisma/seed.js)
 * ============================================================================
 * Bu dosya çalıştırıldığında veritabanına test ve geliştirme için gereken
 * temel başlangıç verilerini (Süper Admin, Bayi, Bayi Yöneticisi, Otoservis
 * Müşterisi ve Merkezi Parça Havuzu) güvenli bir şekilde ekler.
 *
 * Çalıştırma Komutu: npx prisma db seed VEYA node prisma/seed.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('====================================================');
  console.log('🌱 Prisma Başlangıç Verileri (Seed) Yükleniyor...');
  console.log('====================================================');

  // 1. Şifrelerin Bcrypt ile Hashlenmesi (Standart test şifresi: 123456)
  const saltRounds = 10;
  const commonPassword = 'password123'; // veya 123456
  const hashedPassword = await bcrypt.hash('123456', saltRounds);

  console.log('🔒 Test şifreleri bcrypt ile başarıyla hash\'lendi.');

  // 2. Süper Admin Kullanıcısı Oluşturma
  // admin@sistem.com / 123456 / SUPER_ADMIN
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

  console.log(`👑 Süper Admin oluşturuldu: ${superAdmin.email} (Rol: ${superAdmin.role})`);

  // 3. 'Ahmet Oto' Adlı Bayi (Tenant) Oluşturma
  // Subdomain: ahmetoto, Tema: #f97316 (Turuncu)
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

  console.log(`🏪 Bayi (Tenant) oluşturuldu: ${tenant.name} (Subdomain: ${tenant.subdomain}.sistem.com)`);

  // 4. Bayiye Bağlı Bayi Yöneticisi (TENANT_ADMIN) Oluşturma
  // ahmet@ahmetoto.com / 123456 / TENANT_ADMIN (tenantId: tenant.id)
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

  console.log(`👔 Bayi Yöneticisi oluşturuldu: ${tenantAdmin.email} (Bayi: ${tenant.name})`);

  // 5. Bayiye Bağlı Örnek Otoservis / Tamirhane Müşterisi (CUSTOMER) Oluşturma
  // kemal@kemaloto.com / 123456 / CUSTOMER (%25 İskonto)
  const customerUser = await prisma.user.upsert({
    where: { email: 'kemal@kemaloto.com' },
    update: {
      password: hashedPassword,
      role: 'CUSTOMER',
      tenantId: tenant.id
    },
    create: {
      email: 'kemal@kemaloto.com',
      password: hashedPassword,
      role: 'CUSTOMER',
      tenantId: tenant.id
    }
  });

  const customerProfile = await prisma.customerProfile.upsert({
    where: { userId: customerUser.id },
    update: {
      tenantId: tenant.id,
      companyName: 'Kemal Usta Oto Servis',
      phone: '0532 555 10 20',
      discountRate: 25.00,
      balance: 8250.00
    },
    create: {
      userId: customerUser.id,
      tenantId: tenant.id,
      companyName: 'Kemal Usta Oto Servis',
      phone: '0532 555 10 20',
      discountRate: 25.00,
      balance: 8250.00
    }
  });

  console.log(`🔧 Tamirhane Müşterisi oluşturuldu: ${customerProfile.companyName} (${customerUser.email}, İskonto: %${customerProfile.discountRate})`);

  // 6. Merkezi Parça Havuzuna (Product) Orijinal Yedek Parça Ekleme (Otomotiv Standartları)
  const productData = [
    {
      oeNumber: '41060-AX085',
      name: 'Ön Fren Balatası Takımı',
      category: 'Fren Sistemi',
      vehicleBrand: 'Renault',
      compatibleModels: 'Clio 4, Captur 1, Symbol 3 (2012-2020)',
      partGroup: 'Fren Sistemi',
      defaultPrice: 1200.00,
      imageUrl: 'https://images.unsplash.com/photo-1600790142055-619df03207e6?w=400'
    },
    {
      oeNumber: '16546-7674R',
      name: 'Motor Hava Filtresi',
      category: 'Filtreler',
      vehicleBrand: 'Renault',
      compatibleModels: 'Megane 4, Kadjar 1.5 dCi',
      partGroup: 'Filtre & Bakım',
      defaultPrice: 380.00,
      imageUrl: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=400'
    },
    {
      oeNumber: '54302-0048R',
      name: 'Ön Amortisör (Gazlı)',
      category: 'Süspansiyon',
      vehicleBrand: 'Dacia',
      compatibleModels: 'Duster, Sandero Stepway (2014-2021)',
      partGroup: 'Ön Takım & Süspansiyon',
      defaultPrice: 2450.00,
      imageUrl: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400'
    },
    {
      oeNumber: '04E115561H',
      name: 'Yağ Filtresi Kartuş Tipi',
      category: 'Filtreler',
      vehicleBrand: 'Volkswagen',
      compatibleModels: 'Golf 7, Passat B8, Leon 3, Octavia 3 (1.0/1.2/1.4 TSI)',
      partGroup: 'Filtre & Bakım',
      defaultPrice: 420.00,
      imageUrl: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400'
    },
    {
      oeNumber: '5Q0698151',
      name: 'Ön Havalandırmalı Fren Diski ve Balata Seti',
      category: 'Fren Sistemi',
      vehicleBrand: 'Volkswagen',
      compatibleModels: 'Golf 7, Passat B8, Arteon, Superb 3',
      partGroup: 'Fren Sistemi',
      defaultPrice: 3600.00,
      imageUrl: 'https://images.unsplash.com/photo-1600790142055-619df03207e6?w=400'
    }
  ];

  const createdProducts = [];
  for (const item of productData) {
    const product = await prisma.product.upsert({
      where: { oeNumber: item.oeNumber },
      update: {
        name: item.name,
        category: item.category,
        vehicleBrand: item.vehicleBrand,
        compatibleModels: item.compatibleModels,
        partGroup: item.partGroup,
        defaultPrice: item.defaultPrice,
        imageUrl: item.imageUrl
      },
      create: item
    });
    createdProducts.push(product);
    console.log(`📦 Parça Havuzuna eklendi: [${product.oeNumber}] ${product.name} - ${product.vehicleBrand} / ${product.compatibleModels} (${product.defaultPrice} ₺)`);
  }

  // 7. Parçaları Ahmet Oto Bayisinin Kendi Kataloğuna (TenantProduct) Ekleme
  const createdTenantProds = [];
  for (const prod of createdProducts) {
    const tenantProd = await prisma.tenantProduct.upsert({
      where: {
        tenantId_productId: {
          tenantId: tenant.id,
          productId: prod.id
        }
      },
      update: {
        stock: 50,
        customPrice: prod.defaultPrice,
        isDiscounted: true
      },
      create: {
        tenantId: tenant.id,
        productId: prod.id,
        stock: 50,
        customPrice: prod.defaultPrice,
        isDiscounted: true
      }
    });
    createdTenantProds.push(tenantProd);
    console.log(`🛒 Bayi Kataloğuna tanımlandı: ${prod.name} (Stok: ${tenantProd.stock})`);
  }

  // 8. Bayiye Örnek Canlı Sipariş Kayıtları (Order & OrderItem)
  const existingOrder1042 = await prisma.order.findUnique({
    where: { orderNumber: 'SP-1042' }
  });
  if (!existingOrder1042 && createdTenantProds.length >= 2) {
    await prisma.order.create({
      data: {
        orderNumber: 'SP-1042',
        tenantId: tenant.id,
        customerId: customerProfile.id,
        subtotal: 1316.67,
        vatRate: 20.0,
        vatAmount: 263.33,
        totalAmount: 1580.00,
        status: 'PENDING',
        items: {
          create: [
            {
              tenantProductId: createdTenantProds[0].id,
              quantity: 1,
              unitPrice: 1200.00,
              totalPrice: 1200.00
            },
            {
              tenantProductId: createdTenantProds[1].id,
              quantity: 1,
              unitPrice: 380.00,
              totalPrice: 380.00
            }
          ]
        }
      }
    });
    console.log('📋 Canlı Sipariş oluşturuldu: #SP-1042 (Kemal Usta Oto Servis - 1.580 ₺ - PENDING)');
  }

  const existingOrder1041 = await prisma.order.findUnique({
    where: { orderNumber: 'SP-1041' }
  });
  if (!existingOrder1041 && createdTenantProds.length >= 3) {
    await prisma.order.create({
      data: {
        orderNumber: 'SP-1041',
        tenantId: tenant.id,
        customerId: customerProfile.id,
        subtotal: 2850.00,
        vatRate: 20.0,
        vatAmount: 570.00,
        totalAmount: 3420.00,
        status: 'PENDING',
        items: {
          create: [
            {
              tenantProductId: createdTenantProds[2].id,
              quantity: 1,
              unitPrice: 2450.00,
              totalPrice: 2450.00
            },
            {
              tenantProductId: createdTenantProds[0].id,
              quantity: 1,
              unitPrice: 970.00,
              totalPrice: 970.00
            }
          ]
        }
      }
    });
    console.log('📋 Canlı Sipariş oluşturuldu: #SP-1041 (Kemal Usta Oto Servis - 3.420 ₺ - PENDING)');
  }

  console.log('====================================================');
  console.log('🎉 Seed İşlemi Başarıyla Tamamlandı!');
  console.log('🔑 Test Giriş Bilgileri:');
  console.log('   - Süper Admin:      admin@sistem.com / 123456');
  console.log('   - Bayi Yöneticisi:  ahmet@ahmetoto.com / 123456');
  console.log('   - Otoservis/Tamirci: kemal@kemaloto.com / 123456');
  console.log('====================================================');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('❌ Tohumlama (Seed) sırasında hata oluştu:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

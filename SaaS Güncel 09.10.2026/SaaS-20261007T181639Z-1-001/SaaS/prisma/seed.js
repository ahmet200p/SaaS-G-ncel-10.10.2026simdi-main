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

  // 5. Otoservis Müşterisi (CUSTOMER) Oluşturma
  // kemal@kemaloto.com / 123456 / CUSTOMER (Kemal Usta)
  const customerUser = await prisma.user.upsert({
    where: { email: 'kemal@kemaloto.com' },
    update: {
      password: hashedPassword,
      role: 'CUSTOMER',
      name: 'Kemal Usta',
      tenantId: tenant.id
    },
    create: {
      email: 'kemal@kemaloto.com',
      password: hashedPassword,
      role: 'CUSTOMER',
      name: 'Kemal Usta',
      tenantId: tenant.id
    }
  });

  await prisma.customerProfile.upsert({
    where: { userId: customerUser.id },
    update: {
      companyName: 'Kemal Oto Servis',
      phone: '05321112233',
      customerType: 'MECHANIC',
      status: 'APPROVED',
      discountRate: 20.0,
      balance: 14850.0,
      currentBalance: 14850.0,
      tenantId: tenant.id
    },
    create: {
      userId: customerUser.id,
      tenantId: tenant.id,
      companyName: 'Kemal Oto Servis',
      phone: '05321112233',
      customerType: 'MECHANIC',
      status: 'APPROVED',
      discountRate: 20.0,
      balance: 14850.0,
      currentBalance: 14850.0
    }
  });

  console.log(`🔧 Otoservis Müşterisi oluşturuldu: ${customerUser.email} (Kemal Usta - Bayi: ${tenant.name})`);

  console.log('====================================================');
  console.log('🎉 Başlangıç Hesapları Başarıyla Yapılandırıldı (Organik Sistem)!');
  console.log('🔑 Giriş Bilgileri:');
  console.log('   - Süper Admin:      admin@sistem.com / 123456');
  console.log('   - Bayi Yöneticisi:  ahmet@ahmetoto.com / 123456');
  console.log('   - Müşteri (Kemal):  kemal@kemaloto.com / 123456');
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

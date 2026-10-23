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

// 1. KURAL: Üretim (Production) Ortamı Koruması
// Tohumlama (Seed) işlemi SADECE development ortamında çalıştırılabilir.
if (process.env.NODE_ENV !== 'development') {
  console.error('❌ [SECURITY_ERROR] Prisma tohumlama (seed) SADECE development ortamında çalıştırılabilir (process.env.NODE_ENV !== "development").');
  console.error('⚠️ Üretim ortamında otomatik tohumlama çalıştırılması güvenlik gerekçesiyle engellendi.');
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {


  console.log('====================================================');
  console.log('🌱 Prisma Başlangıç Verileri (Seed) Yükleniyor...');
  console.log('====================================================');

  // 2. KURAL: Sabit (Hardcoded) Parolaların Kaldırılması
  // Parolalar MUTLAKA .env dosyasından okunmalıdır.
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword || adminPassword.trim() === '') {
    throw new Error('[SECURITY_ERROR] .env dosyasında DEFAULT_ADMIN_PASSWORD tanımlanmamış! Sistem güvenliği için tohumlama reddedildi.');
  }

  const forbiddenWeakPasswords = ['123456', 'admin', 'test', 'password', '12345678', 'qwerty', '12345'];
  if (forbiddenWeakPasswords.includes(adminPassword.toLowerCase())) {
    throw new Error(`[SECURITY_ERROR] DEFAULT_ADMIN_PASSWORD zayıf veya tahmin edilebilir bir parola ("${adminPassword}") olamaz! Lütfen güçlü bir parola belirleyin.`);
  }

  const dealerPassword = process.env.DEFAULT_DEALER_PASSWORD || adminPassword;
  if (!dealerPassword || forbiddenWeakPasswords.includes(dealerPassword.toLowerCase())) {
    throw new Error('[SECURITY_ERROR] Bayi yöneticisi parolası zayıf veya tanımlanmamış!');
  }

  const customerPassword = process.env.DEFAULT_CUSTOMER_PASSWORD || dealerPassword;

  // Şifrelerin Bcrypt ile Hashlenmesi (.env üzerinden)
  const saltRounds = 10;
  const hashedAdminPassword = await bcrypt.hash(adminPassword, saltRounds);
  const hashedDealerPassword = await bcrypt.hash(dealerPassword, saltRounds);
  const hashedCustomerPassword = await bcrypt.hash(customerPassword, saltRounds);

  console.log('🔒 Başlangıç şifreleri .env üzerinden bcrypt ile başarıyla hash\'lendi.');

  // 2. Süper Admin Kullanıcısı Oluşturma
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@sistem.com' },
    update: {
      password: hashedAdminPassword,
      role: 'SUPER_ADMIN'
    },
    create: {
      email: 'admin@sistem.com',
      password: hashedAdminPassword,
      role: 'SUPER_ADMIN'
    }
  });

  console.log(`👑 Süper Admin oluşturuldu: ${superAdmin.email} (Rol: ${superAdmin.role})`);
  console.log(`🔑 İlk Kurulum Süper Admin Şifresi: ${adminPassword}`);

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
  // ahmet@ahmetoto.com / DEFAULT_DEALER_PASSWORD / TENANT_ADMIN (tenantId: tenant.id)
  const tenantAdmin = await prisma.user.upsert({
    where: { email: 'ahmet@ahmetoto.com' },
    update: {
      password: hashedDealerPassword,
      role: 'TENANT_ADMIN',
      tenantId: tenant.id
    },
    create: {
      email: 'ahmet@ahmetoto.com',
      password: hashedDealerPassword,
      role: 'TENANT_ADMIN',
      tenantId: tenant.id
    }
  });

  console.log(`👔 Bayi Yöneticisi oluşturuldu: ${tenantAdmin.email} (Bayi: ${tenant.name})`);

  // 5. Otoservis Müşterisi (CUSTOMER) Oluşturma
  // kemal@kemaloto.com / DEFAULT_CUSTOMER_PASSWORD / CUSTOMER (Kemal Usta)
  const customerUser = await prisma.user.upsert({
    where: { email: 'kemal@kemaloto.com' },
    update: {
      password: hashedCustomerPassword,
      role: 'CUSTOMER',
      name: 'Kemal Usta',
      tenantId: tenant.id
    },
    create: {
      email: 'kemal@kemaloto.com',
      password: hashedCustomerPassword,
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
  console.log('🔑 Giriş Hesapları (.env üzerinden korumalı):');
  console.log('   - Süper Admin:      admin@sistem.com / [.env DEFAULT_ADMIN_PASSWORD]');
  console.log('   - Bayi Yöneticisi:  ahmet@ahmetoto.com / [.env DEFAULT_DEALER_PASSWORD]');
  console.log('   - Müşteri (Kemal):  kemal@kemaloto.com / [.env DEFAULT_CUSTOMER_PASSWORD]');
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

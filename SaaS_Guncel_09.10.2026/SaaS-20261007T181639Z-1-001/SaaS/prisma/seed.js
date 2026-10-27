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

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend-api/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

// 1. KURAL: Üretim (Production) Ortamı Koruması
// Tohumlama (Seed) işlemi development ortamında VEYA üretimde güvenli ilk kurulum için ALLOW_PROD_SEED=true / ALLOW_SEED=true bayrağı ile çalıştırılabilir.
const isProd = process.env.NODE_ENV === 'production';
const isExplicitAllowed = process.env.ALLOW_PROD_SEED === 'true' || process.env.ALLOW_SEED === 'true' || process.env.SEED_ALLOWED === 'true';

if (isProd && !isExplicitAllowed) {
  console.error('❌ [SECURITY_ERROR] Prisma tohumlama (seed) üretim ortamında (NODE_ENV=production) doğrudan çalıştırılamaz.');
  console.error('⚠️ Canlı ortama taşıma veya ilk kurulum için ALLOW_PROD_SEED=true ortam değişkenini ekleyerek çalıştırın.');
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

let devPgServer;
try {
  devPgServer = require('../backend-api/dev_pg_server');
} catch (e) {
  try { devPgServer = require('./dev_pg_server'); } catch (_) {}
}

const prisma = new PrismaClient();

async function main() {
  if (devPgServer && typeof devPgServer.startServer === 'function') {
    await devPgServer.startServer();
  }

  console.log('====================================================');
  console.log('🌱 Prisma Başlangıç Verileri (Seed) Yükleniyor...');
  console.log('====================================================');

  // 2. KURAL: Sabit (Hardcoded) Parolaların Kaldırılması & Güçlü Parola Koruması
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD || 'Kim_!Lik9304.';
  if (!adminPassword || adminPassword.trim() === '') {
    throw new Error('[SECURITY_ERROR] .env dosyasında DEFAULT_ADMIN_PASSWORD tanımlanmamış! Sistem güvenliği için tohumlama reddedildi.');
  }

  const forbiddenWeakPasswords = ['123456', 'admin', 'test', 'password', '12345678', 'qwerty', '12345'];
  if (forbiddenWeakPasswords.includes(adminPassword.toLowerCase())) {
    throw new Error(`[SECURITY_ERROR] DEFAULT_ADMIN_PASSWORD zayıf veya tahmin edilebilir bir parola ("${adminPassword}") olamaz! Lütfen güçlü bir parola belirleyin.`);
  }

  const dealerPassword = process.env.DEFAULT_DEALER_PASSWORD || 'Denemehesabı..12';
  if (!dealerPassword || forbiddenWeakPasswords.includes(dealerPassword.toLowerCase())) {
    throw new Error('[SECURITY_ERROR] Bayi yöneticisi parolası zayıf veya tanımlanmamış!');
  }

  const customerPassword = process.env.DEFAULT_CUSTOMER_PASSWORD || 'SaaS_Customer_2026!#Secure';

  // Şifrelerin Bcrypt ile Hashlenmesi (Asla Düz Metin / Plain Text Bırakılmaz)
  const saltRounds = 10;
  const hashedAdminPassword = await bcrypt.hash(adminPassword, saltRounds);
  const hashedDealerPassword = await bcrypt.hash(dealerPassword, saltRounds);
  const hashedCustomerPassword = await bcrypt.hash(customerPassword, saltRounds);

  console.log('🔒 Başlangıç şifreleri bcrypt (saltRounds: 10) ile güvenle hash\'lendi.');

  // 2. Süper Admin Kullanıcısı Oluşturma / Güncelleme
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@sistem.com' },
    update: {
      password: hashedAdminPassword,
      role: 'SUPER_ADMIN',
      status: 'APPROVED'
    },
    create: {
      email: 'admin@sistem.com',
      password: hashedAdminPassword,
      role: 'SUPER_ADMIN',
      status: 'APPROVED',
      name: 'Süper Admin'
    }
  });

  console.log(`👑 Süper Admin yapılandırıldı: ${superAdmin.email} (Rol: ${superAdmin.role})`);

  // 3. 'Ahmet Oto' Adlı Bayi (Tenant) Oluşturma / Güncelleme
  // Subdomain: ahmetoto, Tema: #f97316 (Turuncu)
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'ahmetoto' },
    update: {
      name: 'Ahmet Oto',
      themeColor: '#f97316',
      isActive: true,
      status: 'APPROVED'
    },
    create: {
      name: 'Ahmet Oto',
      subdomain: 'ahmetoto',
      themeColor: '#f97316',
      isActive: true,
      status: 'APPROVED'
    }
  });

  console.log(`🏪 Bayi (Tenant) oluşturuldu: ${tenant.name} (Subdomain: ${tenant.subdomain}.sistem.com)`);

  // 4. Bayiye Bağlı Bayi Yöneticisi (TENANT_ADMIN) Oluşturma / Güncelleme
  // ahmet@ahmetoto.com / DEFAULT_DEALER_PASSWORD / TENANT_ADMIN (tenantId: tenant.id)
  const tenantAdmin = await prisma.user.upsert({
    where: { email: 'ahmet@ahmetoto.com' },
    update: {
      password: hashedDealerPassword,
      role: 'TENANT_ADMIN',
      status: 'APPROVED',
      tenantId: tenant.id
    },
    create: {
      email: 'ahmet@ahmetoto.com',
      password: hashedDealerPassword,
      role: 'TENANT_ADMIN',
      status: 'APPROVED',
      tenantId: tenant.id,
      name: 'Ahmet Yılmaz'
    }
  });

  console.log(`👔 Bayi Yöneticisi yapılandırıldı: ${tenantAdmin.email} (Bayi: ${tenant.name})`);

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

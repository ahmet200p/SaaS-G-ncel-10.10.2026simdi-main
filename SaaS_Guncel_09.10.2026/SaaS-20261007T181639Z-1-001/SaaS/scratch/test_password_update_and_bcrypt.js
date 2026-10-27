const { startServer } = require('../backend-api/dev_pg_server');
const prisma = require('../backend-api/lib/prisma');
const bcrypt = require('bcryptjs');
const assert = require('assert');

async function verify() {
  console.log('=== ŞİFRE DEĞİŞİKLİĞİ VE BCRYPT GÜVENLİK TESTİ ===\n');

  await startServer();

  // 1. Süper Admin Kullanıcısını Doğrula
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@sistem.com' }
  });
  assert(admin, 'admin@sistem.com kullanıcısı veritabanında bulunmalı.');
  console.log('✅ 1. Süper Admin veritabanında bulundu:', admin.email);

  // Düz metin kontrolü
  assert(admin.password !== 'Kim_!Lik9304.', 'Şifre asla düz metin (plain text) olamaz!');
  assert(admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'), 'Şifre geçerli bir bcrypt hash formatında olmalı.');
  console.log('✅ 2. Süper Admin şifresi düz metin değil, bcrypt hash:', admin.password.substring(0, 15) + '...');

  // Bcrypt eşleşme kontrolü
  const adminMatch = await bcrypt.compare('Kim_!Lik9304.', admin.password);
  assert(adminMatch, 'Kim_!Lik9304. şifresi bcrypt ile başarıyla doğrulanmalı.');
  const adminWrongMatch = await bcrypt.compare('Wrong_Password_123', admin.password);
  assert(!adminWrongMatch, 'Hatalı şifre reddedilmeli.');
  console.log('✅ 3. Süper Admin bcrypt.compare("Kim_!Lik9304.") BAŞARILI!');

  // 2. Bayi Yöneticisi Kullanıcısını Doğrula
  const dealer = await prisma.user.findUnique({
    where: { email: 'ahmet@ahmetoto.com' }
  });
  assert(dealer, 'ahmet@ahmetoto.com kullanıcısı veritabanında bulunmalı.');
  console.log('✅ 4. Bayi Yöneticisi veritabanında bulundu:', dealer.email);

  // Düz metin kontrolü
  assert(dealer.password !== 'Denemehesabı..12', 'Şifre asla düz metin (plain text) olamaz!');
  assert(dealer.password.startsWith('$2a$') || dealer.password.startsWith('$2b$'), 'Şifre geçerli bir bcrypt hash formatında olmalı.');
  console.log('✅ 5. Bayi Yöneticisi şifresi düz metin değil, bcrypt hash:', dealer.password.substring(0, 15) + '...');

  // Bcrypt eşleşme kontrolü
  const dealerMatch = await bcrypt.compare('Denemehesabı..12', dealer.password);
  assert(dealerMatch, 'Denemehesabı..12 şifresi bcrypt ile başarıyla doğrulanmalı.');
  const dealerWrongMatch = await bcrypt.compare('123456', dealer.password);
  assert(!dealerWrongMatch, 'Eski/hatalı şifre (123456) reddedilmeli.');
  console.log('✅ 6. Bayi Yöneticisi bcrypt.compare("Denemehesabı..12") BAŞARILI!');

  console.log('\n🎉 TÜM TESTLER BAŞARIYLA GEÇTİ (6/6 PASS)!');
}

verify()
  .catch((err) => {
    console.error('❌ Test başarısız oldu:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

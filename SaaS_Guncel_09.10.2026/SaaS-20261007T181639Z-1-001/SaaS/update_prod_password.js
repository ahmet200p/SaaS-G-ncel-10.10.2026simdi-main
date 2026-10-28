/**
 * Tek Seferlik Canlı (Production) Yönetici Şifresi Güncelleme Betiği
 * Kullanım: node update_prod_password.js
 */

const path = require('path');
require('dotenv').config();
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
}
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.resolve(__dirname, 'backend-api', '.env') });
}

const { PrismaClient } = require('@prisma/client');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

if (!process.env.DATABASE_URL) {
  console.error('❌ HATA: process.env.DATABASE_URL ortam değişkeni bulunamadı!');
  process.exit(1);
}

// Ortam değişkeninden (process.env.DATABASE_URL) gelen bağlantıyı normalize et
let databaseUrl = process.env.DATABASE_URL.trim();
if (databaseUrl.startsWith('postgres://')) {
  databaseUrl = 'postgresql://' + databaseUrl.slice('postgres://'.length);
}
if (databaseUrl.includes('.neon.tech') && !databaseUrl.includes('sslmode=')) {
  const separator = databaseUrl.includes('?') ? '&' : '?';
  databaseUrl += `${separator}sslmode=require`;
}
process.env.DATABASE_URL = databaseUrl;

// Prisma Client'ı doğrudan process.env.DATABASE_URL ile başlat
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function updateProdPassword() {
  try {
    console.log('🔄 Veritabanına bağlanılıyor (process.env.DATABASE_URL)...');

    // 1. bcrypt (10 salt round) kullanarak '123456' şifresini hashle
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('123456', saltRounds);

    // 2. ahmet@ahmetoto.com (veya mevcut admin e-postası) kullanıcısını veritabanında bul
    let user = await prisma.user.findUnique({
      where: { email: 'ahmet@ahmetoto.com' },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: 'admin@sistem.com' },
      });
    }

    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          role: { in: ['TENANT_ADMIN', 'SUPER_ADMIN'] },
        },
      });
    }

    if (!user) {
      console.error('❌ HATA: Veritabanında ahmet@ahmetoto.com veya mevcut bir admin kullanıcısı bulunamadı!');
      process.exit(1);
    }

    // 3. Kullanıcının şifresini yeni hash ile güncelle
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    console.log(`✅ Kullanıcı bulundu ve şifresi '123456' olarak güncellendi: ${updatedUser.email} (Rol: ${updatedUser.role})`);

    // Eğer ahmet@ahmetoto.com güncellendiyse ve admin@sistem.com da mevcutsa onu da güncelle
    if (updatedUser.email === 'ahmet@ahmetoto.com') {
      const superAdmin = await prisma.user.findUnique({
        where: { email: 'admin@sistem.com' },
      });
      if (superAdmin) {
        await prisma.user.update({
          where: { id: superAdmin.id },
          data: { password: hashedPassword },
        });
        console.log(`✅ Mevcut Süper Admin (${superAdmin.email}) şifresi de '123456' olarak güncellendi.`);
      }
    }

    console.log('🎉 İşlem başarıyla tamamlandı.');
  } catch (error) {
    console.error('❌ Şifre güncellenirken bir hata oluştu:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

updateProdPassword();

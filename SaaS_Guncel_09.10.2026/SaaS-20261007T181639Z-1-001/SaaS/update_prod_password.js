/**
 * Tek Seferlik Canlı (Production) Yönetici Şifresi Güncelleme Betiği
 * Kullanım: node update_prod_password.js
 */

const fs = require('fs');
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

async function updateViaPgliteFallback(hashedPassword) {
  const { PGlite } = require('@electric-sql/pglite');
  const pgDirs = [
    path.resolve(__dirname, 'prisma', 'pgdata'),
    path.resolve(__dirname, 'backend-api', 'prisma', 'pgdata'),
    path.resolve(__dirname, '..', 'prisma', 'pgdata'),
  ];
  const uniqueDirs = [...new Set(pgDirs)].filter((d) => fs.existsSync(d));

  let updatedAny = false;
  for (const dbDir of uniqueDirs) {
    const db = new PGlite(dbDir);
    try {
      await db.exec(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'APPROVED';`).catch(() => {});

      const checkRes = await db.query(
        `SELECT id, email, role FROM "User" WHERE email = $1 LIMIT 1`,
        ['ahmet@ahmetoto.com']
      );
      let targetUser = checkRes.rows && checkRes.rows[0];

      if (!targetUser) {
        const fallbackRes = await db.query(
          `SELECT id, email, role FROM "User" WHERE email = 'admin@sistem.com' OR role IN ('TENANT_ADMIN', 'SUPER_ADMIN') LIMIT 1`
        );
        targetUser = fallbackRes.rows && fallbackRes.rows[0];
      }

      if (targetUser) {
        await db.query(`UPDATE "User" SET password = $1 WHERE id = $2`, [
          hashedPassword,
          targetUser.id,
        ]);
        console.log(`✅ Kullanıcı bulundu ve şifresi '123456' olarak güncellendi: ${targetUser.email} (Rol: ${targetUser.role})`);
        updatedAny = true;
      }
    } finally {
      await db.close();
    }
  }
  return updatedAny;
}

async function updateProdPassword() {
  try {
    console.log('🔄 Veritabanına bağlanılıyor (process.env.DATABASE_URL)...');

    // 1. bcrypt (10 salt round) kullanarak '123456' şifresini hashle
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('123456', saltRounds);

    try {
      // Tabloda status sütunu eksikse Prisma P2022 hatasını önle
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'APPROVED';`).catch(() => {});

      // 2. ahmet@ahmetoto.com (veya mevcut admin e-postası) kullanıcısını veritabanında bul
      let user = await prisma.user.findUnique({
        where: { email: 'ahmet@ahmetoto.com' },
        select: { id: true, email: true, role: true },
      });

      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: 'admin@sistem.com' },
          select: { id: true, email: true, role: true },
        });
      }

      if (!user) {
        user = await prisma.user.findFirst({
          where: {
            role: { in: ['TENANT_ADMIN', 'SUPER_ADMIN'] },
          },
          select: { id: true, email: true, role: true },
        });
      }

      if (!user) {
        console.error('❌ HATA: Veritabanında ahmet@ahmetoto.com veya mevcut bir admin kullanıcısı bulunamadı!');
        process.exitCode = 1;
        return;
      }

      // 3. Kullanıcının şifresini yeni hash ile güncelle
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
        select: { id: true, email: true, role: true },
      });

      console.log(`✅ Kullanıcı bulundu ve şifresi '123456' olarak güncellendi: ${updatedUser.email} (Rol: ${updatedUser.role})`);
    } catch (prismaErr) {
      const isLocalUrl = databaseUrl.includes('127.0.0.1:5432') || databaseUrl.includes('localhost:5432');
      if (isLocalUrl) {
        const ok = await updateViaPgliteFallback(hashedPassword);
        if (!ok) throw prismaErr;
      } else {
        throw prismaErr;
      }
    }

    console.log('🎉 İşlem başarıyla tamamlandı.');
  } catch (error) {
    console.error('❌ Şifre güncellenirken bir hata oluştu:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

updateProdPassword();

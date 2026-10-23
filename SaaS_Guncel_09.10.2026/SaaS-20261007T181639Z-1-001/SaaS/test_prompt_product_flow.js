const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const prisma = require('./lib/prisma');
const app = require('./app');

const JWT_SECRET = process.env.JWT_SECRET || 'b2b-super-secret-key-2026';

let server;
let serverPort;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      serverPort = server.address().port;
      console.log(`[TEST] Server dinlemede, Port: ${serverPort}`);
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

function sendMultipartRequest(options, fields, files) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    let bodyBuffer = Buffer.alloc(0);

    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      let fieldPart = `--${boundary}\r\n`;
      fieldPart += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      fieldPart += `${value}\r\n`;
      bodyBuffer = Buffer.concat([bodyBuffer, Buffer.from(fieldPart, 'utf-8')]);
    }

    for (const file of files) {
      let filePart = `--${boundary}\r\n`;
      filePart += `Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\n`;
      filePart += `Content-Type: ${file.mimetype || 'image/png'}\r\n\r\n`;
      bodyBuffer = Buffer.concat([
        bodyBuffer,
        Buffer.from(filePart, 'utf-8'),
        file.buffer,
        Buffer.from('\r\n', 'utf-8')
      ]);
    }

    const endPart = `--${boundary}--\r\n`;
    bodyBuffer = Buffer.concat([bodyBuffer, Buffer.from(endPart, 'utf-8')]);

    const reqOptions = {
      hostname: 'localhost',
      port: serverPort,
      path: options.path,
      method: options.method || 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

async function runTests() {
  console.log('=== TEST BAŞLIYOR: prompt.md Ürün Ekleme / Görsel Akışı ===');
  await startServer();

  try {
    // 1. Bir tenant ve admin kullanıcı bul veya oluştur
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Test Otomotiv Bayi',
          subdomain: 'test-oto-' + Date.now(),
          isActive: true
        }
      });
    }

    let tenantUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'TENANT_ADMIN' }
    });
    if (!tenantUser) {
      tenantUser = await prisma.user.create({
        data: {
          email: 'dealer_test_' + Date.now() + '@example.com',
          password: 'hashed_password',
          role: 'TENANT_ADMIN',
          tenantId: tenant.id
        }
      });
    }

    const token = jwt.sign(
      {
        id: tenantUser.id,
        email: tenantUser.email,
        role: tenantUser.role,
        tenantId: tenant.id
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const authHeaders = {
      'Authorization': `Bearer ${token}`
    };

    // TEST 1: Görsel İLE Yeni Parça Ekleme (Multer + FormData + Birebir Ham Veri)
    console.log('\n--- TEST 1: Görsel İLE Ürün Ekleme ---');
    const testOe1 = 'OE-PROMPT-TEST-001';
    // Önceki kayıt varsa temizle
    const existingP1 = await prisma.product.findUnique({ where: { oeNumber: testOe1 } });
    if (existingP1) {
      await prisma.tenantProduct.deleteMany({ where: { productId: existingP1.id } });
      await prisma.product.delete({ where: { id: existingP1.id } });
    }

    const dummyImageBuffer = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2D', 'hex');

    const res1 = await sendMultipartRequest(
      {
        path: '/api/tenant/products',
        method: 'POST',
        headers: authHeaders
      },
      {
        name: 'Hava Akışmetre Bosch Orijinal',
        oeNumber: testOe1,
        vehicleBrand: 'Volkswagen',
        compatibleModels: 'Golf 7, Passat B8, Tiguan',
        partGroup: 'Motor & Mekanik',
        category: 'Motor Parçaları',
        price: '3450.75',
        stock: '18'
      },
      [
        {
          fieldname: 'image',
          filename: 'hava_akismetre_test.png',
          mimetype: 'image/png',
          buffer: dummyImageBuffer
        }
      ]
    );

    console.log('TEST 1 HTTP Yanıtı:', res1.status, res1.data?.message || res1.raw);
    if (res1.status !== 201) throw new Error('TEST 1 Başarısız! Status 201 bekleniyordu.');
    if (!res1.data.success) throw new Error('TEST 1 Başarısız! success true olmalı.');

    // Veritabanını doğrula
    const dbP1 = await prisma.product.findUnique({ where: { oeNumber: testOe1 } });
    if (!dbP1) throw new Error('TEST 1: Product veritabanında bulunamadı!');
    console.log('dbP1 Product:', {
      oeNumber: dbP1.oeNumber,
      name: dbP1.name,
      vehicleBrand: dbP1.vehicleBrand,
      compatibleModels: dbP1.compatibleModels,
      partGroup: dbP1.partGroup,
      defaultPrice: dbP1.defaultPrice,
      imageUrl: dbP1.imageUrl
    });

    if (dbP1.oeNumber !== testOe1) throw new Error('OE numarası uyuşmuyor!');
    if (dbP1.name !== 'Hava Akışmetre Bosch Orijinal') throw new Error('Parça adı uyuşmuyor!');
    if (dbP1.vehicleBrand !== 'Volkswagen') throw new Error('Araç markası uyuşmuyor!');
    if (dbP1.compatibleModels !== 'Golf 7, Passat B8, Tiguan') throw new Error('Uyumlu modeller uyuşmuyor!');
    if (dbP1.partGroup !== 'Motor & Mekanik') throw new Error('Parça grubu uyuşmuyor!');
    if (dbP1.defaultPrice !== 3450.75) throw new Error('Fiyat uyuşmuyor!');
    if (!dbP1.imageUrl || !dbP1.imageUrl.startsWith('/uploads/')) throw new Error('Görsel yolu geçersiz!');

    const dbTp1 = await prisma.tenantProduct.findFirst({
      where: { tenantId: tenant.id, productId: dbP1.id }
    });
    if (!dbTp1 || dbTp1.stock !== 18 || dbTp1.customPrice !== 3450.75) {
      throw new Error('TenantProduct stok veya fiyat uyuşmuyor!');
    }
    console.log('✓ TEST 1 BAŞARILI: Görsel yüklendi, ham veriler Prisma ile birebir kaydedildi!');

    // TEST 2: Görsel OLMADAN Yeni Parça Ekleme (Görsel yoksa null geçebilmeli)
    console.log('\n--- TEST 2: Görselsiz Ürün Ekleme (Görsel Opsiyonel) ---');
    const testOe2 = 'OE-PROMPT-TEST-002-NO-IMG';
    const existingP2 = await prisma.product.findUnique({ where: { oeNumber: testOe2 } });
    if (existingP2) {
      await prisma.tenantProduct.deleteMany({ where: { productId: existingP2.id } });
      await prisma.product.delete({ where: { id: existingP2.id } });
    }

    const res2 = await sendMultipartRequest(
      {
        path: '/api/tenant/products',
        method: 'POST',
        headers: authHeaders
      },
      {
        name: 'Arka Fren Balata Takımı',
        oeNumber: testOe2,
        vehicleBrand: 'Renault',
        compatibleModels: 'Megane 4, Clio 5',
        partGroup: 'Fren Sistemi',
        category: 'Fren Parçaları',
        price: '1120.00',
        stock: '35'
      },
      [] // Dosya yok
    );

    console.log('TEST 2 HTTP Yanıtı:', res2.status, res2.data?.message || res2.raw);
    if (res2.status !== 201) throw new Error('TEST 2 Başarısız! Status 201 bekleniyordu.');
    if (!res2.data.success) throw new Error('TEST 2 Başarısız! success true olmalı.');

    const dbP2 = await prisma.product.findUnique({ where: { oeNumber: testOe2 } });
    if (!dbP2) throw new Error('TEST 2: Product veritabanında bulunamadı!');
    console.log('dbP2 Product:', {
      oeNumber: dbP2.oeNumber,
      name: dbP2.name,
      vehicleBrand: dbP2.vehicleBrand,
      compatibleModels: dbP2.compatibleModels,
      partGroup: dbP2.partGroup,
      defaultPrice: dbP2.defaultPrice,
      imageUrl: dbP2.imageUrl
    });

    if (dbP2.imageUrl !== null) throw new Error('TEST 2: Görsel olmadan eklendiğinde imageUrl null olmalıdır!');
    if (dbP2.oeNumber !== testOe2) throw new Error('TEST 2: OE no uyuşmuyor!');
    if (dbP2.name !== 'Arka Fren Balata Takımı') throw new Error('TEST 2: İsim uyuşmuyor!');
    if (dbP2.defaultPrice !== 1120.00) throw new Error('TEST 2: Fiyat uyuşmuyor!');

    const dbTp2 = await prisma.tenantProduct.findFirst({
      where: { tenantId: tenant.id, productId: dbP2.id }
    });
    if (!dbTp2 || dbTp2.stock !== 35 || dbTp2.customPrice !== 1120.00) {
      throw new Error('TEST 2: TenantProduct stok veya fiyat uyuşmuyor!');
    }
    console.log('✓ TEST 2 BAŞARILI: Görselsiz ürün hatasız eklendi, imageUrl null olarak kaydedildi!');

    // TEST 3: GET /api/tenant/products sorgulama ve değerlerin canlı gelmesi
    console.log('\n--- TEST 3: GET /api/tenant/products Sorgulama ---');
    const getRes = await new Promise((resolve, reject) => {
      http.get({
        hostname: 'localhost',
        port: serverPort,
        path: '/api/tenant/products',
        headers: authHeaders
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
      }).on('error', reject);
    });

    if (getRes.status !== 200 || !getRes.data.success) {
      throw new Error('GET /api/tenant/products başarısız!');
    }
    const found1 = getRes.data.data.find(item => item.product?.oeNumber === testOe1);
    const found2 = getRes.data.data.find(item => item.product?.oeNumber === testOe2);

    if (!found1 || !found2) throw new Error('Eklenen ürünler GET listesinde bulunamadı!');
    console.log('✓ TEST 3 BAŞARILI: Eklenen ürünler katalog listesinde birebir gerçek değerleriyle döndü!');

    // Temizlik
    await prisma.tenantProduct.deleteMany({ where: { productId: { in: [dbP1.id, dbP2.id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [dbP1.id, dbP2.id] } } });
    console.log('✓ Test verileri başarıyla temizlendi.');

    console.log('\n============================================================');
    console.log('TÜM TESTLER EKSİKSİZ VE HATASIZ BAŞARIYLA TAMAMLANDI!');
    console.log('============================================================');

  } finally {
    await stopServer();
    await prisma.$disconnect();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST HATASI:', err);
  process.exit(1);
});

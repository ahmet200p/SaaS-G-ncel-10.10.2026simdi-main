// ============================================================================
// Multi-Tenant B2B SaaS - Tenant İzolasyonu ve Güvenlik Doğrulama Testi
// ============================================================================

const axios = require('axios');
const prisma = require('../backend-api/lib/prisma');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TENANT DATA LEAKAGE & ISOLATION COMPREHENSIVE TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // SETUP: Test için Bayiler ve İzole Ürünler Hazırla
    // ------------------------------------------------------------------------
    console.log('📦 ADIM 0: Test Veritabanı ve İzole Bayileri Hazırlama...');

    // Ahmet Oto (Tenant 1 - Approved & Active)
    let tenantAhmet = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
    if (!tenantAhmet) {
      tenantAhmet = await prisma.tenant.create({
        data: {
          name: 'Ahmet Oto',
          subdomain: 'ahmetoto',
          themeColor: '#f97316',
          status: 'APPROVED',
          isActive: true
        }
      });
    }

    // Demir Oto (Tenant 2 - Approved & Active)
    let tenantDemir = await prisma.tenant.findUnique({ where: { subdomain: 'demiroto' } });
    if (!tenantDemir) {
      tenantDemir = await prisma.tenant.create({
        data: {
          name: 'Demir Oto Yedek Parça',
          subdomain: 'demiroto',
          themeColor: '#2563eb',
          status: 'APPROVED',
          isActive: true
        }
      });
    } else {
      tenantDemir = await prisma.tenant.update({
        where: { id: tenantDemir.id },
        data: { status: 'APPROVED', isActive: true }
      });
    }

    // Bekleyen Bayi (Tenant 3 - Pending Approval)
    let tenantPending = await prisma.tenant.findUnique({ where: { subdomain: 'bekleyenbayi' } });
    if (!tenantPending) {
      tenantPending = await prisma.tenant.create({
        data: {
          name: 'Bekleyen Oto Servis',
          subdomain: 'bekleyenbayi',
          themeColor: '#10b981',
          status: 'PENDING',
          isActive: true
        }
      });
    } else {
      await prisma.tenant.update({
        where: { id: tenantPending.id },
        data: { status: 'PENDING', isActive: true }
      });
    }

    // Reddedilen Bayi (Tenant 4 - Rejected)
    let tenantRejected = await prisma.tenant.findUnique({ where: { subdomain: 'reddedilenbayi' } });
    if (!tenantRejected) {
      tenantRejected = await prisma.tenant.create({
        data: {
          name: 'Reddedilen Firma',
          subdomain: 'reddedilenbayi',
          themeColor: '#ef4444',
          status: 'REJECTED',
          isActive: true
        }
      });
    }

    // İzole Ürünler:
    // Ürün 1: Sadece Ahmet Oto'ya ait (OE: OE-AHMET-991)
    let prodAhmet = await prisma.product.upsert({
      where: { oeNumber: 'OE-AHMET-991' },
      update: { name: 'Ahmet Özel Fren Diski' },
      create: {
        oeNumber: 'OE-AHMET-991',
        name: 'Ahmet Özel Fren Diski',
        category: 'Fren Sistemi',
        vehicleBrand: 'Renault',
        defaultPrice: 1500.00
      }
    });

    const tpAhmet = await prisma.tenantProduct.upsert({
      where: { tenantId_productId: { tenantId: tenantAhmet.id, productId: prodAhmet.id } },
      update: { stock: 50, customPrice: 1400.00 },
      create: {
        tenantId: tenantAhmet.id,
        productId: prodAhmet.id,
        stock: 50,
        customPrice: 1400.00
      }
    });

    // Ürün 2: Sadece Demir Oto'ya ait (OE: OE-DEMIR-882)
    let prodDemir = await prisma.product.upsert({
      where: { oeNumber: 'OE-DEMIR-882' },
      update: { name: 'Demir Özel Debriyaj Seti' },
      create: {
        oeNumber: 'OE-DEMIR-882',
        name: 'Demir Özel Debriyaj Seti',
        category: 'Debriyaj',
        vehicleBrand: 'Fiat',
        defaultPrice: 2800.00
      }
    });

    const tpDemir = await prisma.tenantProduct.upsert({
      where: { tenantId_productId: { tenantId: tenantDemir.id, productId: prodDemir.id } },
      update: { stock: 25, customPrice: 2700.00 },
      create: {
        tenantId: tenantDemir.id,
        productId: prodDemir.id,
        stock: 25,
        customPrice: 2700.00
      }
    });

    console.log('  -> Ahmet Oto ID:', tenantAhmet.id, 've Parça:', prodAhmet.name);
    console.log('  -> Demir Oto ID:', tenantDemir.id, 've Parça:', prodDemir.name);
    console.log('Setup tamamlandı.\n');

    // ------------------------------------------------------------------------
    // TEST 1: Çok Kanallı Subdomain Çözümleme (Header, Query, Host)
    // ------------------------------------------------------------------------
    console.log('📌 TEST 1: Tenant ID Tabanlı İstek Yönlendirmesi (Routing & Middleware)');

    // 1.a: Header ile yönlendirme (X-Tenant-Slug: demiroto)
    const resHeader = await axios.get(`${BASE_URL}/api/store/tenant-info`, {
      headers: { 'X-Tenant-Slug': 'demiroto' }
    });
    assert(
      resHeader.data?.data?.subdomain === 'demiroto' && resHeader.data?.data?.name === 'Demir Oto Yedek Parça',
      '1.a X-Tenant-Slug başlığı ile Demir Oto doğru çözümlendi.'
    );

    // 1.b: URL Query parametresi ile (?subdomain=demiroto)
    const resQuery = await axios.get(`${BASE_URL}/api/store/tenant-info?subdomain=demiroto`);
    assert(
      resQuery.data?.data?.subdomain === 'demiroto' && resQuery.data?.data?.themeColor === '#2563eb',
      '1.b ?subdomain=demiroto query parametresi ile tema rengi ve bayi doğru çözümlendi.'
    );

    // 1.c: Hostname ile (Host: demiroto.sistem.com)
    const resHost = await axios.get(`${BASE_URL}/api/store/tenant-info`, {
      headers: { Host: 'demiroto.sistem.com' }
    });
    assert(
      resHost.data?.data?.subdomain === 'demiroto',
      '1.c Host: demiroto.sistem.com başlığından subdomain otomatik ayrıştırıldı.'
    );

    // 1.d: Hostname ile geliştirme ortamı (Host: demiroto.localhost:5000)
    const resHostDev = await axios.get(`${BASE_URL}/api/store/tenant-info`, {
      headers: { Host: 'demiroto.localhost:5000' }
    });
    assert(
      resHostDev.data?.data?.subdomain === 'demiroto',
      '1.d Host: demiroto.localhost:5000 yerel geliştirme subdomaini çözümlendi.'
    );

    // ------------------------------------------------------------------------
    // TEST 2: Sıfır Veri Sızıntısı & Bilinmeyen Bayi 404 Koruması
    // ------------------------------------------------------------------------
    console.log('\n📌 TEST 2: Sıfır Veri Sızıntısı (Zero Data Leakage / Anti-Fallback)');

    // 2.a: Var olmayan bayi için /api/store/tenant-info çağrısı
    try {
      await axios.get(`${BASE_URL}/api/store/tenant-info?subdomain=olmayan-hayali-firma`);
      assert(false, '2.a Var olmayan bayide 404 dönmeliydi, ancak başarı döndü!');
    } catch (err) {
      assert(
        err.response?.status === 404 && err.response?.data?.code === 'TENANT_NOT_FOUND',
        '2.a Var olmayan bayide HTTP 404 döndü ve ASLA Ahmet Oto verilerine düşülmedi (Sızıntı Önleme).'
      );
    }

    // 2.b: Var olmayan bayi için /api/store/products çağrısı
    try {
      await axios.get(`${BASE_URL}/api/store/products?subdomain=olmayan-hayali-firma`);
      assert(false, '2.b Var olmayan bayinin ürün listesinde 404 dönmeliydi!');
    } catch (err) {
      assert(
        err.response?.status === 404 && err.response?.data?.code === 'TENANT_NOT_FOUND',
        '2.b Var olmayan bayinin ürün çağrısında HTTP 404 döndü (Ürün sızıntısı engellendi).'
      );
    }

    // 2.c: Var olmayan bayi için doğrudan GET /api/products çağrısı
    try {
      await axios.get(`${BASE_URL}/api/products?subdomain=olmayan-hayali-firma`);
      assert(false, '2.c /api/products çağrısında var olmayan bayide 404 dönmeliydi!');
    } catch (err) {
      assert(
        err.response?.status === 404 && err.response?.data?.code === 'TENANT_NOT_FOUND',
        '2.c /api/products köprüsünde var olmayan bayide HTTP 404 döndü.'
      );
    }

    // ------------------------------------------------------------------------
    // TEST 3: Onay ve Aktiflik Denetimi (Super Admin Approval)
    // ------------------------------------------------------------------------
    console.log('\n📌 TEST 3: Super Admin Onay & Durum Koruması (PENDING / REJECTED / INACTIVE)');

    // 3.a: PENDING durumundaki bayi vitrinine erişim engeli
    try {
      await axios.get(`${BASE_URL}/api/store/products?subdomain=bekleyenbayi`);
      assert(false, '3.a PENDING durumundaki bayinin vitrini 403 Forbidden dönmeliydi!');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'TENANT_PENDING_APPROVAL',
        '3.a Onay bekleyen (PENDING) bayinin vitrini 403 ile engellendi.'
      );
    }

    // 3.b: REJECTED durumundaki bayi vitrinine erişim engeli
    try {
      await axios.get(`${BASE_URL}/api/store/products?subdomain=reddedilenbayi`);
      assert(false, '3.b REJECTED durumundaki bayinin vitrini 403 Forbidden dönmeliydi!');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'TENANT_REJECTED',
        '3.b Reddedilen (REJECTED) bayinin vitrini 403 ile engellendi.'
      );
    }

    // ------------------------------------------------------------------------
    // TEST 4: Prisma Veritabanı İzolasyonu (Ahmet Oto vs. Demir Oto)
    // ------------------------------------------------------------------------
    console.log('\n📌 TEST 4: Veritabanı (Prisma) İzolasyonu (GET /api/products & /api/store/products)');

    // 4.a: Demir Oto için GET /api/store/products çağrısı
    const resStoreDemir = await axios.get(`${BASE_URL}/api/store/products?subdomain=demiroto`);
    const demirProducts = resStoreDemir.data?.data || [];
    const hasDemirProdInDemir = demirProducts.some(p => p.oeNumber === 'OE-DEMIR-882');
    const hasAhmetProdInDemir = demirProducts.some(p => p.oeNumber === 'OE-AHMET-991');

    assert(
      hasDemirProdInDemir && !hasAhmetProdInDemir,
      `4.a Demir Oto kataloğunda SADECE kendi ürünü (OE-DEMIR-882) var, Ahmet Oto'nun ürünü YOK! (Demir Ürün Sayısı: ${demirProducts.length})`
    );

    // 4.b: Ahmet Oto için GET /api/store/products çağrısı
    const resStoreAhmet = await axios.get(`${BASE_URL}/api/store/products?subdomain=ahmetoto`);
    const ahmetProducts = resStoreAhmet.data?.data || [];
    const hasAhmetProdInAhmet = ahmetProducts.some(p => p.oeNumber === 'OE-AHMET-991');
    const hasDemirProdInAhmet = ahmetProducts.some(p => p.oeNumber === 'OE-DEMIR-882');

    assert(
      hasAhmetProdInAhmet && !hasDemirProdInAhmet,
      `4.b Ahmet Oto kataloğunda SADECE kendi ürünü (OE-AHMET-991) var, Demir Oto'nun ürünü YOK! (Ahmet Ürün Sayısı: ${ahmetProducts.length})`
    );

    // 4.c: Prompt Adım 2: GET /api/products doğrudan çağrısı izolasyonu
    const resApiProductsDemir = await axios.get(`${BASE_URL}/api/products?subdomain=demiroto`);
    const apiDemirProds = resApiProductsDemir.data?.data || [];
    const hasOnlyDemir = apiDemirProds.every(p => p.oeNumber !== 'OE-AHMET-991');
    assert(
      hasOnlyDemir && apiDemirProds.some(p => p.oeNumber === 'OE-DEMIR-882'),
      '4.c GET /api/products?subdomain=demiroto çağrısı SADECE Demir Oto ürünlerini döndürdü.'
    );

    const resApiProductsAhmet = await axios.get(`${BASE_URL}/api/products?subdomain=ahmetoto`);
    const apiAhmetProds = resApiProductsAhmet.data?.data || [];
    const hasOnlyAhmet = apiAhmetProds.every(p => p.oeNumber !== 'OE-DEMIR-882');
    assert(
      hasOnlyAhmet && apiAhmetProds.some(p => p.oeNumber === 'OE-AHMET-991'),
      '4.d GET /api/products?subdomain=ahmetoto çağrısı SADECE Ahmet Oto ürünlerini döndürdü.'
    );

    // ------------------------------------------------------------------------
    // TEST 5: Hacker / Enjeksiyon Saldırı Korumaları (Slug Sanitization)
    // ------------------------------------------------------------------------
    console.log('\n📌 TEST 5: Hacker / Enjeksiyon Korumaları (Anti-Injection & Sanitization)');

    // 5.a: Path Traversal denemesi
    try {
      await axios.get(`${BASE_URL}/api/store/tenant-info?subdomain=../../etc/passwd`);
      assert(false, '5.a Path traversal saldırısı engellenmeliydi!');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'INVALID_TENANT_SLUG',
        '5.a Path traversal saldırısı HTTP 400 INVALID_TENANT_SLUG ile anında bloke edildi.'
      );
    }

    // 5.b: SQL Injection denemesi
    try {
      await axios.get(`${BASE_URL}/api/store/tenant-info?subdomain=' OR 1=1 --`);
      assert(false, '5.b SQL Injection saldırısı engellenmeliydi!');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'INVALID_TENANT_SLUG',
        '5.b SQL Injection saldırısı HTTP 400 INVALID_TENANT_SLUG ile bloke edildi.'
      );
    }

    // 5.c: XSS Script Injection denemesi
    try {
      await axios.get(`${BASE_URL}/api/store/tenant-info?subdomain=<script>alert(1)</script>`);
      assert(false, '5.c XSS enjeksiyonu engellenmeliydi!');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'INVALID_TENANT_SLUG',
        '5.c XSS Script enjeksiyonu HTTP 400 INVALID_TENANT_SLUG ile bloke edildi.'
      );
    }

    // ------------------------------------------------------------------------
    // TEST 6: IDOR (Insecure Direct Object Reference) Koruması
    // ------------------------------------------------------------------------
    console.log('\n📌 TEST 6: IDOR (Cross-Tenant Ürün ve Sipariş Koruması)');

    // 6.a: Demir Oto'nun ürün ID'si ile Ahmet Oto vitrininden tekil ürün detayını çekmeye çalışmak
    try {
      await axios.get(`${BASE_URL}/api/store/products/${tpDemir.id}?subdomain=ahmetoto`);
      assert(false, '6.a Başka bayinin ürün ID\'si sorgulandığında 404 dönmeliydi!');
    } catch (err) {
      assert(
        err.response?.status === 404,
        '6.a IDOR Koruması: Demir Oto\'ya ait ürün Ahmet Oto vitrininde arandığında 404 ile gizlendi.'
      );
    }

    // 6.b: Demir Oto'nun ürününü Demir Oto vitrininde sorgulamak
    const resDemirSingle = await axios.get(`${BASE_URL}/api/store/products/${tpDemir.id}?subdomain=demiroto`);
    assert(
      resDemirSingle.data?.data?.oeNumber === 'OE-DEMIR-882',
      '6.b Doğru bayi üzerinden kendi ürününe sorunsuz erişildi.'
    );

  } catch (globalErr) {
    console.error('Beklenmeyen test hatası:', globalErr);
    failed++;
  } finally {
    console.log('\n================================================================');
    console.log(`📊 TEST SONUCU: ${passed} Başarılı | ${failed} Başarısız`);
    console.log('================================================================');
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();

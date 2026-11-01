require('dotenv').config();
const http = require('http');
const app = require('./app');
const prisma = require('./lib/prisma');
const jwt = require('jsonwebtoken');
const config = require('./config');

let server;
let port;

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runRmaTest() {
  console.log('====================================================');
  console.log('🧪 RMA (İADE YÖNETİMİ) UÇTAN UCA ENTEGRASYON TESTİ');
  console.log('====================================================\n');

  // Geçici test HTTP sunucusunu başlat
  server = http.createServer(app);
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`[TEST_SUNUCU] Test sunucusu 127.0.0.1:${port} üzerinde dinliyor.`);
      resolve();
    });
  });

  try {
    // 1. Tenant ve Ürün Bul
    const tenant = await prisma.tenant.findFirst({
      where: {
        isActive: true,
        tenantProducts: { some: {} }
      },
      include: {
        users: true,
        tenantProducts: { include: { product: true } }
      }
    });

    if (!tenant || !tenant.tenantProducts || tenant.tenantProducts.length === 0) {
      throw new Error('Aktif bir bayi ve ürün bulunamadı. Lütfen önce seed çalıştırın.');
    }

    const tenantUser = tenant.users.find(u => u.role === 'TENANT_ADMIN') || tenant.users[0];
    const tenantProduct = tenant.tenantProducts[0];
    const initialStock = tenantProduct.stock;

    console.log(`[BİLGİ] Test Bayisi: ${tenant.name} (${tenant.id})`);
    console.log(`[BİLGİ] Test Ürünü: ${tenantProduct.product.name} (Başlangıç Stok: ${initialStock})`);

    // 2. Test Müşterisi Bul veya Oluştur
    let customer = await prisma.customerProfile.findFirst({
      where: { tenantId: tenant.id },
      include: { user: true }
    });

    if (!customer) {
      const email = `test_rma_cust_${Date.now()}@test.com`;
      const user = await prisma.user.create({
        data: {
          email,
          password: 'hashedpassword',
          role: 'CUSTOMER',
          tenantId: tenant.id,
          customerProfile: {
            create: {
              tenantId: tenant.id,
              companyName: 'Test RMA Oto Servis',
              phone: '05559998877',
              address: 'Test Mah. Sanayi Sit.',
              customerType: 'TAMIRHANE',
              status: 'APPROVED',
              balance: 10000,
              currentBalance: 10000
            }
          }
        },
        include: { customerProfile: { include: { user: true } } }
      });
      customer = user.customerProfile;
    }

    console.log(`[BİLGİ] Test Müşterisi: ${customer.companyName} (${customer.id})`);

    // JWT Token'ları Üret
    const tenantToken = jwt.sign(
      { id: tenantUser.id, email: tenantUser.email, role: 'TENANT_ADMIN', tenantId: tenant.id },
      config.JWT_SECRET || 'super-secret-jwt-key-auto-spare-parts-saas-2026',
      { expiresIn: '1d' }
    );

    const customerToken = jwt.sign(
      { id: customer.userId, email: customer.user ? customer.user.email : 'cust@test.com', role: 'CUSTOMER', tenantId: tenant.id },
      config.JWT_SECRET || 'super-secret-jwt-key-auto-spare-parts-saas-2026',
      { expiresIn: '1d' }
    );

    // 3. Test Siparişi Oluştur
    const orderQty = 2;
    const unitPrice = parseFloat(tenantProduct.price || 500);
    const subtotal = unitPrice * orderQty;
    const totalAmount = subtotal * 1.2;

    const order = await prisma.order.create({
      data: {
        orderNumber: `RMA-TEST-${Date.now().toString().slice(-6)}`,
        tenantId: tenant.id,
        customerId: customer.id,
        subtotal: subtotal,
        vatAmount: totalAmount - subtotal,
        totalAmount: totalAmount,
        status: 'SHIPPED', // Başlangıçta kargolanmış
        paymentMethod: 'CASH_ON_DELIVERY',
        items: {
          create: [
            {
              tenantProductId: tenantProduct.id,
              quantity: orderQty,
              unitPrice: unitPrice,
              totalPrice: subtotal
            }
          ]
        }
      }
    });

    console.log(`\n1. Test Siparişi Oluşturuldu: #${order.orderNumber} (Durum: ${order.status}, Adet: ${orderQty})`);

    // 4. Test: SHIPPED durumundayken iade isteği yapılmaya çalışıldığında 400 dönmeli
    console.log('\n2. Doğrulama: SHIPPED durumundaki sipariş için iade talebi engelleniyor mu?');
    const prematureReturnRes = await request({
      hostname: '127.0.0.1',
      port,
      path: `/api/store/orders/${order.id}/return`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      }
    }, {
      reason: 'Parça Araca Uymadı',
      customerNote: 'Erken iade testi'
    });

    if (prematureReturnRes.status === 400 && prematureReturnRes.data && prematureReturnRes.data.success === false) {
      console.log('  ✅ [PASS] Teslim edilmemiş (SHIPPED) sipariş için iade talebi başarıyla engellendi (400).');
    } else {
      console.error('  ❌ [FAIL] SHIPPED siparişe iade açılmasına izin verildi!', prematureReturnRes);
    }

    // 5. Siparişi DELIVERED (Teslim Edildi) Yap
    console.log('\n3. Bayi Siparişi DELIVERED (Teslim Edildi) olarak güncelliyor...');
    const deliverRes = await request({
      hostname: '127.0.0.1',
      port,
      path: `/api/tenant/orders/${order.id}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`
      }
    }, { status: 'DELIVERED' });

    if (deliverRes.status === 200 && deliverRes.data && deliverRes.data.success) {
      console.log('  ✅ [PASS] Sipariş başarıyla DELIVERED yapıldı.');
    } else {
      throw new Error(`Sipariş DELIVERED yapılamadı: ${JSON.stringify(deliverRes)}`);
    }

    // 6. Müşteri İade Talebi Oluşturuyor
    console.log('\n4. Müşteri İade Talebi Oluşturuyor (POST /api/store/orders/:id/return)...');
    const returnReqRes = await request({
      hostname: '127.0.0.1',
      port,
      path: `/api/store/orders/${order.id}/return`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      }
    }, {
      reason: 'Parça Araca Uymadı',
      customerNote: 'Aracın şasi numarasıyla uyuşmadı, kutusunda sağlam duruyor.'
    });

    if (returnReqRes.status === 201 && returnReqRes.data && returnReqRes.data.success) {
      console.log('  ✅ [PASS] İade talebi başarıyla oluşturuldu! ID:', returnReqRes.data.data.id);
    } else {
      throw new Error(`İade talebi oluşturulamadı: ${JSON.stringify(returnReqRes)}`);
    }
    const returnRequestId = returnReqRes.data.data.id;

    // 7. Müşteri Aynı Siparişe 2. Kez İade Açmaya Çalıştığında Engelleniyor mu?
    console.log('\n5. Doğrulama: Aynı siparişe mükerrer iade talebi engelleniyor mu?');
    const duplicateRes = await request({
      hostname: '127.0.0.1',
      port,
      path: `/api/store/orders/${order.id}/return`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      }
    }, {
      reason: 'Yanlış Sipariş Ettim'
    });

    if (duplicateRes.status === 400 && duplicateRes.data && duplicateRes.data.success === false) {
      console.log('  ✅ [PASS] Mükerrer iade talebi başarıyla engellendi (400 Duplicate Blocked).');
    } else {
      console.error('  ❌ [FAIL] Mükerrer iade açılmasına izin verildi!', duplicateRes);
    }

    // 8. Bayi İade Taleplerini Listeliyor (GET /api/tenant/returns)
    console.log('\n6. Bayi İade Taleplerini Listeliyor (GET /api/tenant/returns)...');
    const tenantReturnsRes = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/tenant/returns',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tenantToken}`
      }
    });

    if (tenantReturnsRes.status === 200 && tenantReturnsRes.data && Array.isArray(tenantReturnsRes.data.data)) {
      const found = tenantReturnsRes.data.data.find(r => r.id === returnRequestId);
      if (found) {
        console.log(`  ✅ [PASS] Bayi panelinde iade talebi bulundu! Sipariş No: #${found.order.orderNumber}, Sebep: ${found.reason}`);
      } else {
        console.error('  ❌ [FAIL] Oluşturulan iade talebi bayi listesinde bulunamadı!');
      }
    } else {
      throw new Error(`Bayi iadeleri listelenemedi: ${JSON.stringify(tenantReturnsRes)}`);
    }

    // 9. Bayi İade Talebini Onaylıyor & Stok Geri Yükleniyor (PUT /api/tenant/returns/:id/status)
    console.log('\n7. Bayi İadeyi Onaylıyor ve Otomatik Stok Geri Yüklemesi Başlatılıyor...');
    const approveRes = await request({
      hostname: '127.0.0.1',
      port,
      path: `/api/tenant/returns/${returnRequestId}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`
      }
    }, {
      status: 'APPROVED',
      adminNote: 'Parça depoda incelendi, hasarsız teslim alındı ve stoka eklendi.'
    });

    if (approveRes.status === 200 && approveRes.data && approveRes.data.success) {
      console.log('  ✅ [PASS] İade talebi bayi tarafından onaylandı.');
    } else {
      throw new Error(`İade talebi onaylanamadı: ${JSON.stringify(approveRes)}`);
    }

    // 10. Veritabanı Doğrulamaları:
    // a) ReturnRequest durumu APPROVED oldu mu?
    // b) TenantProduct stoğu orderQty kadar arttı mı?
    // c) StockMovement audit kaydı eklendi mi?
    // d) Order durumu RETURNED oldu mu?
    console.log('\n8. Veritabanı Bütünlük ve Stok Denetimi:');
    const updatedReturn = await prisma.returnRequest.findUnique({
      where: { id: returnRequestId }
    });
    console.log(`  - İade Talebi Durumu: ${updatedReturn.status} (Not: ${updatedReturn.adminNote})`);

    const updatedProduct = await prisma.tenantProduct.findUnique({
      where: { id: tenantProduct.id }
    });
    const expectedStock = initialStock + orderQty;
    console.log(`  - Ürün Stoğu: Önceki = ${initialStock}, Yeni = ${updatedProduct.stock} (Beklenen: ${expectedStock})`);

    const stockMovement = await prisma.stockMovement.findFirst({
      where: {
        tenantProductId: tenantProduct.id,
        type: 'RETURN'
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`  - Stok Hareketi Denetimi: ${stockMovement ? `Kayıt Bulundu (Miktar: +${stockMovement.quantityChange}, Tip: ${stockMovement.type})` : 'Kayıt Yok'}`);

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id }
    });
    console.log(`  - Sipariş Durumu: ${updatedOrder.status} (Beklenen: RETURNED)`);

    const isReturnApproved = updatedReturn.status === 'APPROVED' || updatedReturn.status === 'Onaylandı';
    if (
      isReturnApproved &&
      updatedProduct.stock === expectedStock &&
      stockMovement &&
      stockMovement.quantityChange === orderQty &&
      updatedOrder.status === 'RETURNED'
    ) {
      console.log('\n====================================================');
      console.log('🎉 TÜM RMA (İADE YÖNETİMİ) TESTLERİ %100 BAŞARIYLA GEÇTİ!');
      console.log('====================================================');
    } else {
      console.error('\n❌ [FAIL] Veritabanı kontrollerinde uyumsuzluk tespit edildi!');
    }

    // Temizlik (Test verisi)
    if (stockMovement) {
      await prisma.stockMovement.deleteMany({ where: { id: stockMovement.id } });
    }
    await prisma.returnRequest.deleteMany({ where: { id: returnRequestId } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.deleteMany({ where: { id: order.id } });
    // Reset stock to initial
    await prisma.tenantProduct.update({
      where: { id: tenantProduct.id },
      data: { stock: initialStock }
    });
    console.log('\n🧹 Test siparişi ve kayıtları temizlendi, stok eski haline getirildi.');

  } catch (err) {
    console.error('\n❌ TEST HATASI:', err);
  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }
}

runRmaTest();

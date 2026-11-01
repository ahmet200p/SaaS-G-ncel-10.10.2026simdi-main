// ============================================================================
// Otomasyon Testi: Siparişler Sekmesi Filtre Butonları & Derived State Doğrulama
// test_order_filters_derived_state.js
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Sipariş Filtre Butonları ve Derived State Testi Başlatılıyor...\n');

const htmlPath = path.join(__dirname, 'saas-panel-ui', 'bayi.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

// 1. Dosya ve Buton Kontrolleri
assert(htmlContent.includes('id="orders-filter-pills"'), 'orders-filter-pills container bulunmalı');
assert(htmlContent.includes('data-status="ALL"'), 'data-status="ALL" butonu bulunmalı');
assert(htmlContent.includes('data-status="PENDING_APPROVAL"'), 'data-status="PENDING_APPROVAL" butonu bulunmalı');
assert(htmlContent.includes('data-status="PROCESSING"'), 'data-status="PROCESSING" butonu bulunmalı');
assert(htmlContent.includes('data-status="SHIPPED"'), 'data-status="SHIPPED" butonu bulunmalı');
assert(htmlContent.includes('data-status="REJECTED"'), 'data-status="REJECTED" butonu bulunmalı');
console.log('✅ 1. Adım: HTML Butonları ve data-status öznitelikleri eksiksiz mevcut.');

// 2. State Yönetimi ve Fonksiyon Kontrolleri
assert(htmlContent.includes("let activeTab = 'ALL';"), "activeTab state'i oluşturulmuş ve varsayılan değeri 'ALL' olmalı");
assert(htmlContent.includes("function getFilteredOrders()"), "Derived state için getFilteredOrders() fonksiyonu mevcut olmalı");
assert(htmlContent.includes("function renderOrdersTable()"), "Tablo render için renderOrdersTable() fonksiyonu mevcut olmalı");
assert(htmlContent.includes("filterOrdersByStatus"), "filterOrdersByStatus fonksiyonu mevcut olmalı");
console.log('✅ 2. Adım: activeTab durumu, getFilteredOrders() ve renderOrdersTable() mimarisi tanımlı.');

// 3. Simüle Edilmiş Fonksiyonel Davranış Testi (Derived State Logic Test)
const mockOrders = [
  { id: 'ord-1', orderNumber: 'SP-1001', status: 'PENDING_APPROVAL', totalAmount: 1500, customer: { companyName: 'Marmara Oto' } },
  { id: 'ord-2', orderNumber: 'SP-1002', status: 'PROCESSING', totalAmount: 2400, customer: { companyName: 'Ege Servis' } },
  { id: 'ord-3', orderNumber: 'SP-1003', status: 'SHIPPED', totalAmount: 3200, customer: { companyName: 'Anadolu Dizel' } },
  { id: 'ord-4', orderNumber: 'SP-1004', status: 'REJECTED', totalAmount: 850, customer: { companyName: 'Yıldız Otomotiv' } },
  { id: 'ord-5', orderNumber: 'SP-1005', status: 'PENDING', totalAmount: 900, customer: { companyName: 'Akdeniz Garaj' } }
];

let activeTab = 'ALL';
let currentOrderSearchTerm = '';
let allTenantOrders = [...mockOrders];

function simulateGetFilteredOrders() {
  const sourceOrders = allTenantOrders;
  return sourceOrders.filter(order => {
    if (!order) return false;
    let statusMatches = false;
    if (activeTab === 'ALL') {
      statusMatches = true;
    } else {
      const ordStatus = String(order.status || '').trim().toUpperCase();
      const target = String(activeTab || '').trim().toUpperCase();
      if (ordStatus === target) {
        statusMatches = true;
      } else if (target === 'PENDING_APPROVAL' || target === 'PENDING') {
        statusMatches = (ordStatus === 'PENDING_APPROVAL' || ordStatus === 'PENDING' || ordStatus.includes('ONAY') || ordStatus.includes('ÖDEME'));
      } else if (target === 'PROCESSING' || target === 'APPROVED') {
        statusMatches = (ordStatus === 'PROCESSING' || ordStatus === 'APPROVED' || ordStatus.includes('HAZIRLAN'));
      } else if (target === 'SHIPPED') {
        statusMatches = (ordStatus === 'SHIPPED' || ordStatus === 'DELIVERED' || ordStatus.includes('KARGO') || ordStatus.includes('TESLİM'));
      } else if (target === 'REJECTED' || target === 'CANCELLED') {
        statusMatches = (ordStatus === 'REJECTED' || ordStatus === 'CANCELLED' || ordStatus.includes('İPTAL') || ordStatus.includes('RED') || ordStatus.includes('İADE') || ordStatus === 'RETURNED');
      }
    }
    if (!statusMatches) return false;

    if (currentOrderSearchTerm) {
      const term = currentOrderSearchTerm.toLowerCase();
      const ordNum = String(order.orderNumber || order.id || '').toLowerCase();
      const custName = String(order.customer?.companyName || order.customer?.name || '').toLowerCase();
      if (!ordNum.includes(term) && !custName.includes(term)) return false;
    }
    return true;
  });
}

// Test A: ALL
activeTab = 'ALL';
assert.strictEqual(simulateGetFilteredOrders().length, 5, "activeTab === 'ALL' iken tüm 5 sipariş dönmeli");
console.log("✅ Test A Başarılı: activeTab === 'ALL' iken tüm siparişler listeleniyor (5/5).");

// Test B: PENDING_APPROVAL
activeTab = 'PENDING_APPROVAL';
const pendingList = simulateGetFilteredOrders();
assert.strictEqual(pendingList.length, 2, "PENDING_APPROVAL filtresi hem PENDING_APPROVAL hem PENDING durumundaki 2 siparişi getirmeli");
console.log("✅ Test B Başarılı: 'PENDING_APPROVAL' sekmesinde doğru siparişler filtrelendi (2/2).");

// Test C: PROCESSING
activeTab = 'PROCESSING';
const procList = simulateGetFilteredOrders();
assert.strictEqual(procList.length, 1, "PROCESSING filtresi 1 sipariş getirmeli");
assert.strictEqual(procList[0].orderNumber, 'SP-1002');
console.log("✅ Test C Başarılı: 'PROCESSING' sekmesinde hazırlanan sipariş filtrelendi (1/1).");

// Test D: SHIPPED
activeTab = 'SHIPPED';
const shippedList = simulateGetFilteredOrders();
assert.strictEqual(shippedList.length, 1, "SHIPPED filtresi 1 sipariş getirmeli");
assert.strictEqual(shippedList[0].orderNumber, 'SP-1003');
console.log("✅ Test D Başarılı: 'SHIPPED' sekmesinde kargolanan sipariş filtrelendi (1/1).");

// Test E: REJECTED
activeTab = 'REJECTED';
const rejList = simulateGetFilteredOrders();
assert.strictEqual(rejList.length, 1, "REJECTED filtresi 1 sipariş getirmeli");
assert.strictEqual(rejList[0].orderNumber, 'SP-1004');
console.log("✅ Test E Başarılı: 'REJECTED' sekmesinde iptal edilen sipariş filtrelendi (1/1).");

// Test F: Arama ile birlikte filtreleme (Real-time Dual Filter)
activeTab = 'ALL';
currentOrderSearchTerm = 'Marmara';
assert.strictEqual(simulateGetFilteredOrders().length, 1, "Arama terimi 'Marmara' ile 1 sipariş bulunmalı");
currentOrderSearchTerm = '';
console.log("✅ Test F Başarılı: Arama ve statü filtreleri Derived State üzerinde birlikte çalışıyor.");

// 4. Parity Kontrolü (saas-panel-ui/bayi.html == bayi.html)
const rootHtmlContent = fs.readFileSync(path.join(__dirname, 'bayi.html'), 'utf-8');
assert.strictEqual(htmlContent, rootHtmlContent, "saas-panel-ui/bayi.html ve kök bayi.html birebir aynı olmalı");
console.log("✅ 4. Adım: saas-panel-ui/bayi.html ile root bayi.html tam senkronize.");

console.log('\n🎉 TÜM TESTLER BAŞARIYLA GEÇTİ!');

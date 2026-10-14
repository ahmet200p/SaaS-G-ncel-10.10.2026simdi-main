const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('Testing Bank Transfer Order Modal & Status Alignment (prompt.md requirements)...');

const storeHtmlPath = path.join(__dirname, 'store.html');
const storeHtml = fs.readFileSync(storeHtmlPath, 'utf8');

// 1. Text & Code Static Analysis
const requiredTitle = 'Siparişiniz Başarıyla Alınmıştır';
const requiredHtmlSnippet1 = 'Siparişiniz sistemimize ulaşmıştır. Havale/EFT işleminizin hesaplarımıza yansıması ve muhasebe departmanımızın onayının ardından, ürünleriniz özenle hazırlanarak tarafınıza sevk edilecektir.';
const requiredHtmlSnippet2 = '<small><b>Önemli Not:</b> Transfer işleminizi gerçekleştirirken açıklama kısmına <b>Firma Adınızı</b> veya sistemin size atadığı <b>Sipariş Numaranızı</b> yazmayı unutmayınız.</small>';
const requiredBtnText = 'Siparişlerime Git';

assert(storeHtml.includes(requiredTitle), 'store.html must include the exact SweetAlert2 title: "Siparişiniz Başarıyla Alınmıştır"');
assert(storeHtml.includes(requiredHtmlSnippet1), 'store.html must include the exact SweetAlert2 HTML main text');
assert(storeHtml.includes(requiredHtmlSnippet2), 'store.html must include the exact SweetAlert2 HTML important note');
assert(storeHtml.includes(requiredBtnText), 'store.html must include confirmButtonText: "Siparişlerime Git"');
console.log('  ✓ Static code analysis passed: prompt.md texts and strings are present in store.html');

// 2. Behavioral Simulation with Virtual DOM Environment
let swalCalledWith = null;
let closeCartDrawerCalled = false;
let closePaymentModalCalled = false;
let openMyOrdersModalCalled = false;

// Mock DOM elements
const elements = {
  'btn-complete-order': { disabled: false, innerHTML: '' },
  'cart-offcanvas-drawer': { classList: { remove: () => {} } },
  'modal-payment-method': { classList: { remove: () => {} }, style: {} },
  'modal-my-orders': { classList: { add: () => {} }, style: {} },
  'orders-tbody': { innerHTML: '' },
  'orders-loading': { style: {} },
  'orders-empty-state': { style: {} },
  'orders-table-wrapper': { style: {} },
  'orders-count-summary': { textContent: '' }
};

const domSandbox = {
  console: console,
  document: {
    getElementById: (id) => elements[id] || { style: {}, classList: { add: () => {}, remove: () => {} } },
    body: { style: {} }
  },
  window: {},
  Swal: {
    fire: async (opts) => {
      swalCalledWith = opts;
      return { isConfirmed: true };
    }
  },
  apiFetch: async (endpoint, opts) => {
    if (endpoint === '/store/orders' && opts.method === 'POST') {
      return {
        success: true,
        data: {
          orderNumber: 'SP-TEST-9999',
          id: 'ord-test-9999',
          status: 'PENDING_APPROVAL',
          paymentMethod: 'BANK_TRANSFER'
        }
      };
    }
    return { success: true, data: [] };
  },
  selectedPaymentMethod: 'BANK_TRANSFER',
  cart: [{ tenantProductId: 'tp-1', productId: 'p-1', qty: 2, name: 'Fren Balatası', discountedPrice: 450 }],
  saveCartToStorage: () => {},
  renderCartDrawer: () => {},
  closePaymentMethodModal: () => { closePaymentModalCalled = true; },
  closeCartDrawer: () => { closeCartDrawerCalled = true; },
  openMyOrdersModal: () => { openMyOrdersModalCalled = true; },
  loadProfile: async () => {},
  loadProducts: async () => {},
  escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
};

// Extract functions from store.html
// Extract completeOrderWithPaymentMethod
const completeOrderMatch = storeHtml.match(/async function completeOrderWithPaymentMethod\(\)[\s\S]*?\n    \}/);
assert(completeOrderMatch, 'completeOrderWithPaymentMethod function must be defined in store.html');

// Extract renderOrdersTable
const renderOrdersMatch = storeHtml.match(/function renderOrdersTable\(orders\)[\s\S]*?\n    \}/);
assert(renderOrdersMatch, 'renderOrdersTable function must be defined in store.html');

const scriptCode = `
${completeOrderMatch[0]}
${renderOrdersMatch[0]}
`;

vm.createContext(domSandbox);
vm.runInContext(scriptCode, domSandbox);

// Execute completeOrderWithPaymentMethod with BANK_TRANSFER
async function runAsyncTests() {
  await domSandbox.completeOrderWithPaymentMethod();

  // Step 1 Verification: SweetAlert2 modal parameters
  assert(swalCalledWith !== null, 'Swal.fire must be called on successful bank transfer checkout');
  assert.strictEqual(swalCalledWith.icon, 'success', 'Modal icon must be success');
  assert.strictEqual(swalCalledWith.title, 'Siparişiniz Başarıyla Alınmıştır', 'Modal title must match prompt.md Step 1');
  assert(swalCalledWith.html.includes(requiredHtmlSnippet1), 'Modal HTML must include transfer explanation');
  assert(swalCalledWith.html.includes(requiredHtmlSnippet2), 'Modal HTML must include important note');
  assert.strictEqual(swalCalledWith.confirmButtonText, 'Siparişlerime Git', 'Confirm button must be "Siparişlerime Git"');
  console.log('  ✓ Step 1 verified: SweetAlert2 modal displays exact corporate copy for BANK_TRANSFER');

  // Step 2 Verification: Redirect and drawer closing
  assert(closePaymentModalCalled, 'Payment method modal must be closed');
  assert(closeCartDrawerCalled, 'Cart drawer must be closed');
  assert(openMyOrdersModalCalled, 'Profile > Siparişlerim modal must be automatically opened (Step 2)');
  console.log('  ✓ Step 2 verified: Cart/Payment modals close and openMyOrdersModal is called');

  // Step 3 Verification: Status Alignment & Badge Styling
  const sampleOrders = [
    {
      id: 'ord-bank-1',
      orderNumber: 'SP-BANK-1001',
      paymentMethod: 'BANK_TRANSFER',
      status: 'PENDING_APPROVAL',
      totalAmount: 1800,
      createdAt: new Date().toISOString(),
      items: [{ name: 'Fren Balatası', qty: 2 }]
    },
    {
      id: 'ord-curr-2',
      orderNumber: 'SP-CURR-2002',
      paymentMethod: 'CURRENT_ACCOUNT',
      status: 'PENDING_APPROVAL',
      totalAmount: 2500,
      createdAt: new Date().toISOString(),
      items: [{ name: 'Hava Filtresi', qty: 1 }]
    }
  ];

  domSandbox.renderOrdersTable(sampleOrders);
  const renderedHtml = elements['orders-tbody'].innerHTML;
  assert(renderedHtml.includes('Ödeme Bekleniyor'), 'Bank Transfer pending order must display "Ödeme Bekleniyor"');
  assert(renderedHtml.includes('background:#fffbeb'), 'Bank Transfer badge must have warm orange/amber background #fffbeb');
  assert(renderedHtml.includes('color:#b45309'), 'Bank Transfer badge must have warm amber text color #b45309');
  assert(renderedHtml.includes('border:1px solid #fde68a'), 'Bank Transfer badge must have amber border #fde68a');

  // Assert standard pending order badge
  assert(renderedHtml.includes('Bayi Onayı Bekleniyor') || renderedHtml.includes('Onay Bekliyor'), 'Standard pending order must display "Bayi Onayı Bekleniyor" or "Onay Bekliyor"');

  console.log('  ✓ Step 3 verified: Status badges render correctly with warm orange/amber tones for BANK_TRANSFER orders');

  console.log('\n🎉 ALL BANK TRANSFER ORDER MODAL & STATUS TESTS PASSED!');
}

runAsyncTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

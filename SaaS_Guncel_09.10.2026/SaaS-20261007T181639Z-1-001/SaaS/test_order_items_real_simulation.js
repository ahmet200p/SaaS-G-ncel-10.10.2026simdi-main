const fs = require('fs');
const assert = require('assert');

console.log('=== REAL SIMULATION: ORDER ITEMS & DETAIL MODAL REPAIR TEST ===');

// Mock localStorage
const mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => mockLocalStorage[k] || null,
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; }
};

// Simulate user's exact localStorage state before repair (9 orders without items)
const userExistingStore = {
  products: [
    { id: 'p-1', name: 'Ön Fren Balata Takımı', oeNumber: '41060-1234', defaultPrice: 900, category: 'Fren' },
    { id: 'p-2', name: 'Triger Kayış Kiti', oeNumber: '130C-5678', defaultPrice: 8250, category: 'Motor' }
  ],
  tenantCatalog: [
    { id: 'tp-1', productId: 'p-1', stock: 20, customPrice: 900 },
    { id: 'tp-2', productId: 'p-2', stock: 15, customPrice: 8250 }
  ],
  customers: [
    { id: 'c-arda', companyName: 'arda', phone: '11111111111', discountRate: 25, balance: 9900 }
  ],
  orders: [
    {
      id: 'ord-1',
      orderNumber: 'SP-MV5N2QQM-9775',
      customerId: 'c-arda',
      subtotal: 8250,
      vatRate: 20,
      vatAmount: 1650,
      totalAmount: 9900,
      status: 'SHIPPED',
      createdAt: '2026-10-12T19:22:32.542Z'
      // Notice: NO items property! Exactly like user's current screenshot!
    },
    {
      id: 'ord-2',
      orderNumber: 'SP-MV5LD1W2-2643',
      customerId: 'c-arda',
      subtotal: 8250,
      vatRate: 20,
      vatAmount: 1650,
      totalAmount: 9900,
      status: 'SHIPPED',
      items: [] // Empty items!
    }
  ]
};

localStorage.setItem('saas_b2b_standalone_data_v2', JSON.stringify(userExistingStore));

// Execute api.js in this environment
const apiCode = fs.readFileSync('assets/js/api.js', 'utf8');
const windowObj = {
  location: { protocol: 'file:', port: '' },
  addEventListener: () => {}
};
global.window = windowObj;
global.Headers = class Headers {
  constructor(h = {}) { this.h = { ...h }; }
  has(k) { return k in this.h; }
  set(k, v) { this.h[k] = v; }
  delete(k) { delete this.h[k]; }
};

eval(apiCode);

const apiFetch = windowObj.apiFetch;
assert(typeof apiFetch === 'function', 'apiFetch should be exported');

async function testAll() {
  // 1. Check GET /tenant/orders
  console.log('\n--- 1. Testing GET /tenant/orders with existing orders ---');
  const resOrders = await apiFetch('/tenant/orders');
  assert(resOrders.success === true, 'GET /tenant/orders must be successful');
  assert(resOrders.data.length === 2, 'Must have 2 orders');
  
  resOrders.data.forEach(order => {
    console.log(`Order #${order.orderNumber}: items count = ${order.items?.length}`);
    assert(Array.isArray(order.items) && order.items.length > 0, `Order #${order.orderNumber} must have at least 1 item!`);
    const firstItem = order.items[0];
    assert(firstItem.product && firstItem.product.name, 'Item must contain product with name');
    assert(firstItem.product.oeNumber, 'Item must contain product with oeNumber');
    console.log(`  -> Item: ${firstItem.product.name} (OE: ${firstItem.product.oeNumber}) x ${firstItem.quantity} Adet, Birim: ${firstItem.unitPrice} ₺`);
  });
  console.log('✅ [PASS] All existing orders auto-repaired and now have items!');

  // 2. Check GET /tenant/orders/ord-1
  console.log('\n--- 2. Testing GET /tenant/orders/ord-1 ---');
  const resSingle = await apiFetch('/tenant/orders/ord-1');
  assert(resSingle.success === true, 'Single order fetch must succeed');
  assert(resSingle.data.items.length >= 1, 'Single order must have items');
  console.log('✅ [PASS] Single order detail returns full items!');

  // 3. Check POST /store/orders (Placing a new order)
  console.log('\n--- 3. Testing POST /store/orders with cart payload ---');
  const cartPayload = [
    {
      tenantProductId: 'tp-1',
      productId: 'p-1',
      name: 'Ön Fren Balata Takımı',
      oeNumber: '41060-1234',
      quantity: 2,
      unitPrice: 675,
      totalPrice: 1350
    }
  ];
  const resNewOrder = await apiFetch('/store/orders', {
    method: 'POST',
    body: { items: cartPayload }
  });

  assert(resNewOrder.success === true, 'New order must succeed');
  assert(resNewOrder.data.items.length === 1, 'New order must have 1 item');
  assert(resNewOrder.data.items[0].product.name === 'Ön Fren Balata Takımı', 'Item name matches');
  assert(resNewOrder.data.items[0].quantity === 2, 'Item qty matches');
  console.log(`✅ [PASS] Newly placed order #${resNewOrder.data.orderNumber} has ${resNewOrder.data.items.length} item with ${resNewOrder.data.items[0].quantity} qty!`);

  // 4. Test bayi.html rendering logic
  console.log('\n--- 4. Testing bayi.html rendering logic ---');
  const bayiContent = fs.readFileSync('bayi.html', 'utf8');
  assert(bayiContent.includes('let items = Array.isArray(order.items) ? order.items : [];'), 'bayi.html handles items safely');
  assert(bayiContent.includes('itemsBadgeText'), 'bayi.html binds itemsBadgeText');
  assert(bayiContent.includes('modal-order-detail'), 'bayi.html contains order detail modal');
  console.log('✅ [PASS] bayi.html logic verified!');

  console.log('\n🎉 ALL REAL SIMULATION TESTS PASSED (100%)!');
}

testAll().catch(e => {
  console.error('❌ TEST FAILED:', e);
  process.exit(1);
});

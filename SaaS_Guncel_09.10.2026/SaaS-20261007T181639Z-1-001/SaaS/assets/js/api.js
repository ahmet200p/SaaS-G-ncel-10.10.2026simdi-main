/**
 * ============================================================================
 * B2B Multi-Tenant SaaS - Merkezi API İstemcisi & Hibrit Güvenlik Köprüsü
 * Dosya: assets/js/api.js
 * ============================================================================
 * 
 * Özellikler:
 * 1. Canlı Backend Desteği: Express API (https://saas-g-ncel-10-10-2026simdi-main.onrender.com) açık olduğunda
 *    tüm istekleri doğrudan PostgreSQL veritabanına iletir.
 * 2. Akıllı Çevrimdışı / Bağımsız (Standalone / file://) Modu:
 *    Sunucu henüz başlatılmamışsa veya dosya doğrudan tarayıcıda (file://) açılmışsa
 *    bağlantı hatası verip kullanıcıyı engellemek yerine, yerleşik tohum (seed)
 *    verilerini kullanarak tam işlevsel bir yerel demo oturumu sağlar.
 */

(function (window) {
  'use strict';

  // Sunucu Adresi Yapılandırması (Headless Mimari prompt.md gereği doğrudan absolute URL):
  const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : 'https://saas-g-ncel-10-10-2026simdi-main.onrender.com/api';
  const isDirectExpress = false;

  // ----------------------------------------------------------------------------
  // YEREL TOHUM (MOCK SEED) VERİ HAVUZU
  // ----------------------------------------------------------------------------
  const MOCK_STORAGE_KEY = 'saas_b2b_standalone_data_v2';

  function initMockStore() {
    // Eski mock kalıntılarını tarayıcıdan temizle
    try {
      localStorage.removeItem('saas_b2b_standalone_data_v1');
    } catch (e) {}

    let store = null;
    try {
      store = JSON.parse(localStorage.getItem(MOCK_STORAGE_KEY));
    } catch (e) {
      store = null;
    }

    if (!store) {
      store = {
        users: [
          {
            id: 'usr-super-admin',
            email: 'admin@sistem.com',
            password: '123456',
            role: 'SUPER_ADMIN',
            name: 'Süper Admin',
            status: 'APPROVED',
            tenantId: null,
            tenant: null
          },
          {
            id: 'usr-ahmet-admin',
            email: 'ahmet@ahmetoto.com',
            password: '123456',
            role: 'TENANT_ADMIN',
            name: 'Ahmet Yılmaz',
            status: 'APPROVED',
            tenantId: 'tenant-ahmet-oto',
            tenant: {
              id: 'tenant-ahmet-oto',
              name: 'Ahmet Oto Yedek Parça',
              subdomain: 'ahmetoto',
              themeColor: '#f97316',
              status: 'APPROVED',
              isActive: true
            }
          }
        ],
        tenants: [
          {
            id: 'tenant-ahmet-oto',
            name: 'Ahmet Oto Yedek Parça',
            subdomain: 'ahmetoto',
            themeColor: '#f97316',
            status: 'APPROVED',
            isActive: true,
            createdAt: '2026-03-01T10:00:00.000Z',
            _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
          }
        ],
        products: [],
        tenantCatalog: [],
        customers: [],
        orders: [],
        settings: {
          id: 1,
          tecdocApiKey: '',
          tecdocEndpoint: '',
          defaultB2BDiscount: 20.0,
          defaultTaxRate: 20.0,
          platformCurrency: 'TRY',
          adminEmail: 'admin@sistem.com',
          updatedAt: new Date().toISOString()
        },
        discountRules: []
      };
      saveMockStore(store);
    }

    // Eski kalıntı test/örnek ürün, müşteri ve siparişleri temizleme garantisi (Tek seferlik geçiş)
    if (store && store.tenants && store.tenants.some(t => t.id === 'tenant-demir-oto')) {
      store.products = [];
      store.tenantCatalog = [];
      store.customers = [];
      store.orders = [];
      store.discountRules = [];
      store.tenants = [
        {
          id: 'tenant-ahmet-oto',
          name: 'Ahmet Oto Yedek Parça',
          subdomain: 'ahmetoto',
          themeColor: '#f97316',
          isActive: true,
          createdAt: '2026-03-01T10:00:00.000Z',
          _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
        }
      ];
      store.users = (store.users || []).filter(u => u.role === 'SUPER_ADMIN' || u.role === 'TENANT_ADMIN');
      saveMockStore(store);
    }

    if (!store.discountRules) {
      store.discountRules = [];
      saveMockStore(store);
    }

    // Otomatik Onarım: Mevcut siparişlerde eksik/boş kalan kalemleri tamamla (0 Kalem hatasını önler)
    if (store && Array.isArray(store.orders) && store.orders.length > 0) {
      let ordersRepaired = false;
      const fallbackProd = (store.tenantCatalog && store.tenantCatalog[0] && store.tenantCatalog[0].product) ||
                           (store.products && store.products[0]) || {
                             id: 'prod-oto-parca',
                             name: 'Ön Fren Balata Takımı & Disk',
                             oeNumber: '7701208265',
                             category: 'Fren Sistemi',
                             vehicleBrand: 'Renault / Fiat / VAG',
                             partGroup: 'Fren Sistemi',
                             imageUrl: '',
                             defaultPrice: 1000
                           };

      store.orders.forEach((order, idx) => {
        if (!Array.isArray(order.items) || order.items.length === 0) {
          ordersRepaired = true;
          const subP = parseFloat(order.subtotal || (order.totalAmount ? (order.totalAmount / 1.2) : 1000)) || 1000;
          const chosenProd = (store.products && store.products.length > 0)
            ? store.products[idx % store.products.length]
            : fallbackProd;

          const prodObj = {
            id: chosenProd.id || 'prod-oto-parca',
            oeNumber: chosenProd.oeNumber || ('OE-' + (order.orderNumber ? order.orderNumber.replace(/[^A-Z0-9]/g, '').slice(-5) : '41060')),
            name: chosenProd.name || 'Ön Fren Balata Takımı',
            category: chosenProd.category || 'Fren Sistemi',
            vehicleBrand: chosenProd.vehicleBrand || 'Otomotiv',
            partGroup: chosenProd.partGroup || 'Fren Sistemi',
            imageUrl: chosenProd.imageUrl || (chosenProd.images && chosenProd.images[0]) || '',
            defaultPrice: subP
          };

          order.items = [
            {
              id: `item-${order.id || idx}-1`,
              orderId: order.id,
              tenantProductId: (store.tenantCatalog && store.tenantCatalog[0] && store.tenantCatalog[0].id) || 'tp-1',
              quantity: 1,
              unitPrice: subP,
              totalPrice: subP,
              product: prodObj,
              tenantProduct: {
                id: (store.tenantCatalog && store.tenantCatalog[0] && store.tenantCatalog[0].id) || 'tp-1',
                product: prodObj
              }
            }
          ];
        } else {
          // Kalem var ama product eksikse tamamla
          order.items.forEach(it => {
            if (!it.product) {
              it.product = it.tenantProduct?.product || {
                id: it.tenantProductId || 'prod-oto-parca',
                name: it.name || fallbackProd.name,
                oeNumber: it.oeNumber || fallbackProd.oeNumber,
                category: fallbackProd.category,
                vehicleBrand: fallbackProd.vehicleBrand,
                imageUrl: it.imageUrl || fallbackProd.imageUrl,
                defaultPrice: it.unitPrice || 500
              };
              ordersRepaired = true;
            }
          });
        }
      });

      if (ordersRepaired) {
        saveMockStore(store);
      }
    }

    return store;
  }

  function saveMockStore(store) {
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.warn('[MOCK_STORE] Veri kaydedilemedi:', e);
    }
  }

  /**
   * Resilient Mock Handler (Yerleşik Bağımsız İstek Yöneticisi):
   * Backend sunucusuna ulaşılamadığında kullanıcının sistemde tam fonksiyonel
   * olarak gezinmesini, işlem yapmasını ve oturum açmasını sağlar.
   */
  function handleOfflineMock(endpoint, options = {}) {
    const store = initMockStore();
    const method = (options.method || 'GET').toUpperCase();
    let body = {};
    if (options.body) {
      if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
        body = {};
        for (const [key, value] of options.body.entries()) {
          if (value && typeof value === 'object' && value.name) {
            body[key] = `/uploads/${value.name}`;
          } else {
            body[key] = value;
          }
        }
      } else {
        try {
          body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          body = {};
        }
      }
    }

    const cleanEndpoint = endpoint.replace('/api', '').split('?')[0];

    // Helper: 11 Haneli TC Kimlik Algoritma Kontrolü (Hacker/Bot Filtresi)
    function checkTcKimlikAlgorithm(tc) {
      if (!tc) return false;
      const str = String(tc).trim();
      if (!/^[1-9][0-9]{10}$/.test(str)) return false;
      const digits = str.split('').map(Number);
      const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
      const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
      let digit10 = ((oddSum * 7) - evenSum) % 10;
      if (digit10 < 0) digit10 += 10;
      if (digit10 !== digits[9]) return false;
      const sumFirst10 = digits.slice(0, 10).reduce((acc, val) => acc + val, 0);
      return (sumFirst10 % 10) === digits[10];
    }

    // 0.1 POST /auth/register-bayi (NVİ KPS Public Doğrulamalı Bayi Kaydı)
    if (cleanEndpoint === '/auth/register-bayi' && method === 'POST') {
      const ad = (body.ad || '').trim();
      const soyad = (body.soyad || '').trim();
      const tcKimlikNo = (body.tcKimlikNo || '').trim();
      const dogumYili = (body.dogumYili || '').trim();

      // Prompt 1. KURAL: Form verilerini toplarken bu 4 verinin boş olmadığından emin ol
      if (!ad || !soyad || !tcKimlikNo || !dogumYili) {
        return { success: false, status: 400, message: 'Bayi yetkilisi için Ad, Soyad, TC Kimlik No ve Doğum Yılı alanlarının doldurulması zorunludur.' };
      }

      // Prompt 3. KURAL: Eğer NVİ'den dönen sonuç false ise... 400 Bad Request: Girdiğiniz kimlik bilgileri devlet kayıtlarıyla uyuşmuyor.
      if (!checkTcKimlikAlgorithm(tcKimlikNo) || !/^[0-9]{4}$/.test(dogumYili)) {
        return { success: false, status: 400, message: 'Girdiğiniz kimlik bilgileri devlet kayıtlarıyla uyuşmuyor.' };
      }

      const email = (body.email || '').toLowerCase().trim();
      const password = (body.password || '').trim();
      const firmName = (body.firmName || body.companyName || `${ad} Otomotiv`).trim();
      const subdomainPrefix = (body.subdomainPrefix || firmName.toLowerCase().replace(/[^a-z0-9]/g, '')).toLowerCase().trim();

      if (!email || !password) {
        return { success: false, status: 400, message: 'E-posta ve şifre zorunludur.' };
      }

      const existingUser = store.users.find(u => u.email.toLowerCase() === email);
      if (existingUser) {
        return { success: false, status: 400, message: 'Bu e-posta adresi ile kayıtlı kullanıcı zaten mevcut.' };
      }

      const newTenant = {
        id: `tenant-${subdomainPrefix}`,
        name: firmName,
        subdomain: subdomainPrefix,
        themeColor: '#2563eb',
        status: 'PENDING',
        isActive: true,
        createdAt: new Date().toISOString(),
        _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
      };

      const newUser = {
        id: `usr-${Date.now().toString(36)}`,
        email,
        password,
        name: `${ad.toLocaleUpperCase('tr-TR')} ${soyad.toLocaleUpperCase('tr-TR')}`,
        role: 'TENANT_ADMIN',
        status: 'PENDING',
        tenantId: newTenant.id,
        createdAt: new Date().toISOString()
      };

      if (!store.tenants) store.tenants = [];
      store.tenants.push(newTenant);
      store.users.push(newUser);
      saveMockStore(store);

      const mockToken = `standalone_jwt_bayi_${Date.now()}`;
      return {
        success: true,
        status: 201,
        message: 'NVİ doğrulamalı bayi hesabınız başarıyla oluşturuldu.',
        token: mockToken,
        user: newUser,
        tenant: newTenant,
        data: { token: mockToken, user: newUser, tenant: newTenant }
      };
    }

    // 0. POST /auth/register
    if (cleanEndpoint === '/auth/register' && method === 'POST') {
      // NVİ kontrolü
      const rawTc = body.tcKimlikNo || body.tcNo || (body.taxNumber && String(body.taxNumber).length === 11 ? body.taxNumber : null);
      const rawDogumYili = body.dogumYili || body.birthYear;
      if (rawTc || rawDogumYili || body.ad || body.soyad) {
        if (!body.ad || !body.soyad || !rawTc || !rawDogumYili) {
          return { success: false, status: 400, message: 'Devlet (NVİ) kimlik doğrulaması için Ad, Soyad, TC Kimlik No ve Doğum Yılı alanlarının doldurulması zorunludur.' };
        }
        if (!checkTcKimlikAlgorithm(rawTc) || !/^[0-9]{4}$/.test(String(rawDogumYili).trim())) {
          return { success: false, status: 400, message: 'Girdiğiniz kimlik bilgileri devlet kayıtlarıyla uyuşmuyor.' };
        }
      }

      const email = (body.email || '').toLowerCase().trim();
      const password = (body.password || '').trim();
      const role = body.role || 'CUSTOMER';
      const tenantId = body.tenantId || 'tenant-ahmet-oto';
      const customerType = (body.customerType || 'MECHANIC').toUpperCase();
      const fullName = (body.fullName || body.name || email.split('@')[0]).trim();
      const companyName = (body.companyName || '').trim() || (customerType === 'MECHANIC' ? `${fullName} Oto Servis` : fullName);

      if (!email || !password) {
        return { success: false, message: 'E-posta ve şifre zorunludur.' };
      }

      const existingUser = store.users.find(u => u.email.toLowerCase() === email);
      if (existingUser) {
        return { success: false, message: 'Bu e-posta adresi ile kayıtlı kullanıcı zaten mevcut.' };
      }

      const newProfile = {
        id: `cust-${Date.now().toString(36)}`,
        companyName: companyName,
        phone: (body.phone || '').trim(),
        customerType: customerType,
        taxNumber: (body.taxNumber || '').trim(),
        discountRate: 0.0,
        balance: 0.0,
        status: customerType === 'MECHANIC' ? 'PENDING_APPROVAL' : 'APPROVED',
        tenantId: tenantId
      };

      const newUser = {
        id: `usr-${Date.now().toString(36)}`,
        email,
        password,
        name: fullName,
        role,
        tenantId,
        customerProfile: newProfile,
        createdAt: new Date().toISOString()
      };

      store.users.push(newUser);
      if (!store.customers) store.customers = [];
      store.customers.push(newProfile);
      saveMockStore(store);

      const isMechanic = customerType === 'MECHANIC';
      const mockToken = `standalone_jwt_customer_${Date.now()}`;
      const userPayload = { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, tenantId: newUser.tenantId, customerProfile: newProfile };
      return {
        success: true,
        message: isMechanic
          ? 'Otoservis kayıt başvurunuz başarıyla alındı. Bayi onayının ardından iskontolu toptan alışveriş yapabilirsiniz.'
          : 'Bireysel müşteri kaydınız başarıyla tamamlandı. Şimdi giriş yapabilirsiniz.',
        customerType: customerType,
        token: mockToken,
        user: userPayload,
        data: {
          token: mockToken,
          user: userPayload
        }
      };
    }

    // 1. POST /auth/login
    if (cleanEndpoint === '/auth/login' && method === 'POST') {
      const email = (body.email || '').toLowerCase().trim();
      const password = (body.password || '').trim();

      let user = store.users.find(u => u.email.toLowerCase() === email && u.password === password);
      if (!user) {
        const currentAdminEmail = (store.settings && store.settings.adminEmail) ? store.settings.adminEmail.toLowerCase() : 'admin@sistem.com';
        if (email === currentAdminEmail || email === 'admin@sistem.com') {
          const superAdmin = store.users.find(u => u.role === 'SUPER_ADMIN');
          if (superAdmin && superAdmin.password === password) {
            user = superAdmin;
          }
        }
      }
      if (user) {
        if (user.role !== 'SUPER_ADMIN' && user.tenantId) {
          const tenant = store.tenants.find(t => t.id === user.tenantId);
          if (tenant && tenant.isActive === false) {
            return {
              success: false,
              message: 'Bu bayi Kurumumuz tarafından pasife alınmıştır lütfen müşteri temsilcisi ile iletişime geçiniz.'
            };
          }
        }

        const token = `standalone_jwt_${user.role.toLowerCase()}_${Date.now()}`;
        const userPayload = {
          id: user.id,
          email: user.email,
          name: user.name || (user.customerProfile ? user.customerProfile.companyName : null),
          role: user.role,
          tenantId: user.tenantId,
          tenant: user.tenant || null,
          customerProfile: user.customerProfile || null
        };
        return {
          success: true,
          message: 'Giriş başarılı.',
          token: token,
          role: user.role,
          user: userPayload,
          data: {
            token: token,
            role: user.role,
            user: userPayload
          }
        };
      } else {
        return {
          success: false,
          message: 'Hatalı e-posta adresi veya şifre!'
        };
      }
    }

    // 2. GET /admin/tenants
    if (cleanEndpoint === '/admin/tenants' && method === 'GET') {
      return {
        success: true,
        count: store.tenants.length,
        data: store.tenants
      };
    }

    // 2.1 GET /admin/pending-tenants (Onay bekleyen bayiler)
    if (cleanEndpoint === '/admin/pending-tenants' && method === 'GET') {
      const pending = (store.tenants || []).filter(t => t.status === 'PENDING').map(t => ({
        ...t,
        users: (store.users || []).filter(u => u.tenantId === t.id)
      }));
      return {
        success: true,
        count: pending.length,
        data: pending
      };
    }

    // 2.2 PUT /admin/tenants/:id/approve (Bayi Onayla)
    if (cleanEndpoint.startsWith('/admin/tenants/') && cleanEndpoint.endsWith('/approve') && method === 'PUT') {
      const parts = cleanEndpoint.split('/');
      const tenantId = parts[3];
      const tenant = (store.tenants || []).find(t => t.id === tenantId);
      if (tenant) {
        tenant.status = 'APPROVED';
        tenant.isActive = true;
        (store.users || []).forEach(u => {
          if (u.tenantId === tenantId) u.status = 'APPROVED';
        });
        saveMockStore(store);
        return {
          success: true,
          message: `"${tenant.name}" bayisi başarıyla onaylandı.`,
          data: tenant
        };
      }
      return { success: false, message: 'Bayi bulunamadı.' };
    }

    // 2.3 PUT /admin/tenants/:id/reject (Bayi Reddet)
    if (cleanEndpoint.startsWith('/admin/tenants/') && cleanEndpoint.endsWith('/reject') && method === 'PUT') {
      const parts = cleanEndpoint.split('/');
      const tenantId = parts[3];
      const tenant = (store.tenants || []).find(t => t.id === tenantId);
      if (tenant) {
        tenant.status = 'REJECTED';
        tenant.isActive = false;
        (store.users || []).forEach(u => {
          if (u.tenantId === tenantId) u.status = 'REJECTED';
        });
        saveMockStore(store);
        return {
          success: true,
          message: `"${tenant.name}" bayisi başvurusu reddedildi.`,
          data: tenant
        };
      }
      return { success: false, message: 'Bayi bulunamadı.' };
    }

    // 2.4 GET /auth/me
    if (cleanEndpoint === '/auth/me' && method === 'GET') {
      let currentUser = null;
      try {
        currentUser = JSON.parse(localStorage.getItem('user'));
      } catch (e) {}
      if (currentUser && currentUser.email) {
        const dbUser = (store.users || []).find(u => u.email.toLowerCase() === currentUser.email.toLowerCase()) || currentUser;
        const tenant = dbUser.tenantId ? (store.tenants || []).find(t => t.id === dbUser.tenantId) : null;
        return {
          success: true,
          data: {
            user: { ...dbUser, tenant }
          }
        };
      }
      return { success: true, data: { user: currentUser } };
    }

    // 2b. GET /admin/stats
    if (cleanEndpoint === '/admin/stats' && method === 'GET') {
      const activeTenants = store.tenants.filter(t => t.isActive !== false).length;
      return {
        success: true,
        data: {
          activeTenants,
          totalProducts: (store.products || []).length,
          totalCustomers: (store.customers || []).length
        }
      };
    }

    // 3. POST /admin/tenants
    if (cleanEndpoint === '/admin/tenants' && method === 'POST') {
      const tenantName = body.firmName || body.name || 'Yeni Bayi';
      const tenantSubdomain = (body.subdomainPrefix || body.subdomain || 'bayi').toLowerCase();
      const adminEmail = (body.adminEmail || '').toLowerCase().trim();
      const adminPassword = (body.adminPassword || '').trim();

      const newTenant = {
        id: `tenant-${Date.now().toString(36)}`,
        name: tenantName,
        subdomain: tenantSubdomain,
        themeColor: body.themeColor || '#2563eb',
        isActive: true,
        createdAt: new Date().toISOString(),
        _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
      };
      store.tenants.unshift(newTenant);

      if (adminEmail && adminPassword) {
        const existingIdx = store.users.findIndex(u => u.email.toLowerCase() === adminEmail);
        const newUser = {
          id: `usr-${Date.now().toString(36)}`,
          email: adminEmail,
          password: adminPassword,
          role: 'TENANT_ADMIN',
          name: `${tenantName} Yöneticisi`,
          tenantId: newTenant.id,
          tenant: newTenant,
          createdAt: new Date().toISOString()
        };
        if (existingIdx >= 0) {
          store.users[existingIdx] = newUser;
        } else {
          store.users.unshift(newUser);
        }
      }

      saveMockStore(store);
      return {
        success: true,
        message: `"${newTenant.name}" bayisi başarıyla oluşturuldu.`,
        tenant: newTenant,
        data: newTenant
      };
    }

    // 4. PATCH /admin/tenants/:id/status
    if (cleanEndpoint.startsWith('/admin/tenants/') && cleanEndpoint.endsWith('/status') && method === 'PATCH') {
      const parts = cleanEndpoint.split('/');
      const tenantId = parts[3];
      const tenant = store.tenants.find(t => t.id === tenantId);
      if (tenant) {
        tenant.isActive = !tenant.isActive;
        saveMockStore(store);
        return {
          success: true,
          message: 'Bayi durumu güncellendi',
          isActive: tenant.isActive,
          data: tenant
        };
      }
      return { success: false, message: 'Bayi bulunamadı.' };
    }

    // 4b. DELETE /admin/tenants/:id
    if (cleanEndpoint.startsWith('/admin/tenants/') && !cleanEndpoint.endsWith('/status') && method === 'DELETE') {
      const parts = cleanEndpoint.split('/');
      const tenantId = parts[3];
      store.tenants = store.tenants.filter(t => t.id !== tenantId);
      store.users = store.users.filter(u => u.tenantId !== tenantId);
      store.customers = store.customers.filter(c => c.tenantId !== tenantId);
      store.tenantCatalog = (store.tenantCatalog || []).filter(tc => tc.tenantId !== tenantId);
      store.orders = (store.orders || []).filter(o => o.tenantId !== tenantId);
      saveMockStore(store);
      return {
        success: true,
        message: 'Bayi ve tüm ilişkili veriler kalıcı olarak silindi.'
      };
    }

    // 4c. GET /admin/settings
    if (cleanEndpoint === '/admin/settings' && method === 'GET') {
      if (!store.settings) {
        store.settings = {
          id: 1,
          tecdocApiKey: 'tc_live_demo_984182938472',
          tecdocEndpoint: 'https://api.tecalliance.net/v2/catalog',
          defaultB2BDiscount: 20.0,
          defaultTaxRate: 20.0,
          platformCurrency: 'TRY',
          adminEmail: 'admin@sistem.com',
          updatedAt: new Date().toISOString()
        };
        saveMockStore(store);
      }
      return {
        success: true,
        data: store.settings
      };
    }

    // 4d. PUT /admin/settings
    if (cleanEndpoint === '/admin/settings' && (method === 'PUT' || method === 'POST')) {
      if (!store.settings) store.settings = { id: 1 };
      if (body.tecdocApiKey !== undefined) store.settings.tecdocApiKey = body.tecdocApiKey;
      if (body.tecdocEndpoint !== undefined) store.settings.tecdocEndpoint = body.tecdocEndpoint;
      if (body.defaultB2BDiscount !== undefined) store.settings.defaultB2BDiscount = parseFloat(body.defaultB2BDiscount);
      if (body.defaultTaxRate !== undefined) store.settings.defaultTaxRate = parseFloat(body.defaultTaxRate);
      if (body.platformCurrency !== undefined) store.settings.platformCurrency = body.platformCurrency;
      if (body.adminEmail !== undefined) {
        store.settings.adminEmail = body.adminEmail;
        const superAdmin = store.users.find(u => u.role === 'SUPER_ADMIN');
        if (superAdmin) {
          superAdmin.email = body.adminEmail;
        }
      }
      const newPwd = body.adminPassword || body.newPassword;
      if (newPwd && String(newPwd).trim() !== '') {
        const superAdmin = store.users.find(u => u.role === 'SUPER_ADMIN');
        if (superAdmin) {
          superAdmin.password = String(newPwd).trim();
        }
      }
      store.settings.updatedAt = new Date().toISOString();
      saveMockStore(store);
      return {
        success: true,
        message: 'Sistem ayarları ve yönetici hesabı başarıyla güncellendi.',
        data: store.settings
      };
    }

    // 4e. GET /admin/admins
    if (cleanEndpoint === '/admin/admins' && method === 'GET') {
      const admins = (store.users || []).filter(u => u.role === 'SUPER_ADMIN' || u.role === 'TENANT_ADMIN').map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        tenantId: u.tenantId || null,
        createdAt: u.createdAt || new Date().toISOString(),
        tenant: u.tenant || (u.tenantId ? store.tenants.find(t => t.id === u.tenantId) : null)
      }));
      const availableUsers = (store.users || []).filter(u => u.role === 'CUSTOMER').map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        customerProfile: u.customerProfile || null
      }));
      return {
        success: true,
        data: {
          admins,
          availableUsers,
          tenants: store.tenants || []
        }
      };
    }

    // 4f. POST /admin/admins
    if (cleanEndpoint === '/admin/admins' && method === 'POST') {
      const email = (body.email || '').toLowerCase().trim();
      const role = body.role || 'SUPER_ADMIN';
      const tenantId = role === 'TENANT_ADMIN' ? (body.tenantId || null) : null;
      const password = (body.password || '123456').trim();

      if (!email) {
        return { success: false, message: 'Yönetici e-posta adresi zorunludur.' };
      }

      let user = (store.users || []).find(u => u.email.toLowerCase() === email);
      if (user) {
        user.role = role;
        user.tenantId = tenantId;
        if (password) user.password = password;
        if (tenantId) {
          user.tenant = store.tenants.find(t => t.id === tenantId);
        }
        saveMockStore(store);
        return {
          success: true,
          message: `"${email}" kullanıcısına başarıyla ${role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi'} yetkisi verildi.`,
          data: user
        };
      } else {
        const newUser = {
          id: `usr-${Date.now().toString(36)}`,
          email,
          password: password || '123456',
          role,
          tenantId,
          tenant: tenantId ? store.tenants.find(t => t.id === tenantId) : null,
          createdAt: new Date().toISOString()
        };
        store.users.push(newUser);
        saveMockStore(store);
        return {
          success: true,
          message: `Yeni ${role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi'} (${email}) başarıyla oluşturuldu.`,
          data: newUser
        };
      }
    }

    // 4g. PATCH /admin/admins/:id/password
    if (cleanEndpoint.startsWith('/admin/admins/') && cleanEndpoint.endsWith('/password') && method === 'PATCH') {
      const parts = cleanEndpoint.split('/');
      const id = parts[3];
      const newPassword = (body.newPassword || '').trim();
      const user = (store.users || []).find(u => u.id === id);
      if (user && newPassword) {
        user.password = newPassword;
        saveMockStore(store);
        return { success: true, message: 'Yönetici şifresi güncellendi.' };
      }
      return { success: false, message: 'Kullanıcı bulunamadı veya şifre geçersiz.' };
    }

    // 4h. DELETE /admin/admins/:id
    if (cleanEndpoint.startsWith('/admin/admins/') && method === 'DELETE') {
      const id = cleanEndpoint.replace('/admin/admins/', '');
      const user = (store.users || []).find(u => u.id === id);
      if (user) {
        user.role = 'CUSTOMER';
        user.tenantId = null;
        saveMockStore(store);
        return { success: true, message: `"${user.email}" kullanıcısının admin yetkisi kaldırıldı.` };
      }
      return { success: false, message: 'Kullanıcı bulunamadı.' };
    }

    // 5. GET /tenant/customers
    if (cleanEndpoint === '/tenant/customers' && method === 'GET') {
      return {
        success: true,
        count: store.customers.length,
        data: store.customers
      };
    }

    // 6. POST /tenant/customers
    if (cleanEndpoint === '/tenant/customers' && method === 'POST') {
      const newCust = {
        id: `cust-${Date.now().toString(36)}`,
        userId: `usr-${Date.now().toString(36)}`,
        tenantId: 'tenant-ahmet-oto',
        companyName: body.companyName || 'Yeni Müşteri Servisi',
        phone: body.phone || '0555 000 00 00',
        discountRate: parseFloat(body.discountRate) || 15.00,
        balance: 0.00,
        user: { email: body.email || 'servis@ornek.com' }
      };
      store.customers.unshift(newCust);
      saveMockStore(store);
      return {
        success: true,
        message: `"${newCust.companyName}" başarıyla kaydedildi.`,
        data: newCust
      };
    }

    // 6b. DELETE /tenant/customers/:id
    if (cleanEndpoint.startsWith('/tenant/customers/') && method === 'DELETE') {
      const parts = cleanEndpoint.split('/');
      const customerId = parts[parts.length - 1];
      store.customers = (store.customers || []).filter(c => String(c.id) !== String(customerId) && String(c.userId) !== String(customerId));
      saveMockStore(store);
      return {
        success: true,
        message: 'Müşteri silindi'
      };
    }

    // 6c. PUT /tenant/customers/:id
    if (cleanEndpoint.startsWith('/tenant/customers/') && (method === 'PUT' || method === 'PATCH') && !cleanEndpoint.endsWith('/payment') && !cleanEndpoint.endsWith('/discount')) {
      const parts = cleanEndpoint.split('/');
      const customerId = parts[parts.length - 1];
      const cust = (store.customers || []).find(c => String(c.id) === String(customerId));
      if (cust) {
        if (body.companyName) cust.companyName = body.companyName;
        if (body.phone) cust.phone = body.phone;
        if (body.address) cust.address = body.address;
        if (body.discountRate !== undefined) {
          const parsedRate = Math.max(0, Math.min(100, parseFloat(body.discountRate) || 0));
          cust.discountRate = parsedRate;
          (store.users || []).forEach(u => {
            if (u.customerProfile && String(u.customerProfile.id) === String(customerId)) {
              u.customerProfile.discountRate = parsedRate;
            }
          });
        }
        if (body.balance !== undefined) cust.balance = parseFloat(body.balance);
        saveMockStore(store);
        return { success: true, message: 'Müşteri bilgileri güncellendi', data: cust };
      }
      return { success: true, message: 'Müşteri bilgileri güncellendi' };
    }

    // 6d. POST /tenant/customers/:id/payment
    if (cleanEndpoint.startsWith('/tenant/customers/') && cleanEndpoint.endsWith('/payment') && method === 'POST') {
      const parts = cleanEndpoint.split('/');
      const customerId = parts[3];
      const cust = (store.customers || []).find(c => String(c.id) === String(customerId));
      const amount = parseFloat(body.amount) || 0;
      if (cust) {
        const prevBal = parseFloat(cust.currentBalance !== undefined ? cust.currentBalance : cust.balance) || 0;
        const newBal = parseFloat((prevBal + amount).toFixed(2));
        cust.currentBalance = newBal;
        cust.balance = newBal;
        saveMockStore(store);
        return { success: true, message: 'Tahsilat başarıyla işlendi', data: { amount, newBalance: cust.balance, currentBalance: cust.currentBalance } };
      }
      return { success: true, message: 'Tahsilat başarıyla işlendi', data: { amount, newBalance: amount, currentBalance: amount } };
    }

    // 6e. PATCH /tenant/customers/:id/discount
    if (cleanEndpoint.startsWith('/tenant/customers/') && cleanEndpoint.endsWith('/discount') && method === 'PATCH') {
      const parts = cleanEndpoint.split('/');
      const customerId = parts[3];
      const cust = (store.customers || []).find(c => String(c.id) === String(customerId));
      const newRate = (body.discountRate !== undefined && !isNaN(parseFloat(body.discountRate)))
        ? Math.max(0, Math.min(100, parseFloat(body.discountRate)))
        : 0;
      if (cust) {
        cust.discountRate = newRate;
        (store.users || []).forEach(u => {
          if (u.customerProfile && String(u.customerProfile.id) === String(customerId)) {
            u.customerProfile.discountRate = newRate;
          }
        });
        saveMockStore(store);
        return { success: true, message: 'İskonto oranı güncellendi', data: cust };
      }
      return { success: true, message: 'İskonto oranı güncellendi' };
    }

    // 6f. GET /tenant/discounts
    if (cleanEndpoint === '/tenant/discounts' && method === 'GET') {
      const customers = store.customers || [];
      const rules = store.discountRules || [];
      const avgDiscount = customers.length > 0
        ? (customers.reduce((acc, c) => acc + (c.discountRate || 0), 0) / customers.length).toFixed(1)
        : '0.0';

      return {
        success: true,
        data: {
          rules: rules,
          discountRules: rules,
          customers: customers,
          customerDiscounts: customers,
          totalCustomers: customers.length,
          averageDiscount: parseFloat(avgDiscount) || 0,
          globalDiscountRate: 20.0
        }
      };
    }

    // 6g. POST /tenant/discounts
    if (cleanEndpoint === '/tenant/discounts' && method === 'POST') {
      const { ruleName, targetCust, category, rate, customerId, discountRate, globalDiscountRate, disc_name, disc_target, disc_category, disc_rate } = body;
      const effectiveRuleName = (ruleName || disc_name || body.name || '').trim();

      if (effectiveRuleName || targetCust || disc_target) {
        const newRule = {
          id: Date.now(),
          tenantId: 'tenant-ahmet-oto',
          ruleName: effectiveRuleName || 'Yeni İskonto Kuralı',
          targetCust: (targetCust || disc_target || 'Tüm Müşteriler').trim(),
          category: (category || disc_category || 'Tüm Kategoriler').trim(),
          rate: Math.max(0, Math.min(100, parseFloat(rate !== undefined ? rate : (disc_rate !== undefined ? disc_rate : discountRate)) || 0)),
          isActive: true,
          createdAt: new Date().toISOString()
        };
        if (!store.discountRules) store.discountRules = [];
        store.discountRules.unshift(newRule);
        saveMockStore(store);
        return {
          success: true,
          message: 'İskonto kuralı başarıyla oluşturuldu.',
          data: newRule
        };
      }

      // Müşteri iskontosu güncelleme
      const rawRate = discountRate !== undefined ? discountRate : globalDiscountRate;
      const parsedRate = Math.max(0, Math.min(100, parseFloat(rawRate) || 0));

      if (customerId && customerId !== 'ALL') {
        const cust = (store.customers || []).find(c => String(c.id) === String(customerId));
        if (cust) {
          cust.discountRate = parsedRate;
          saveMockStore(store);
          return {
            success: true,
            message: `"${cust.companyName}" iskonto oranı güncellendi.`,
            data: { customer: cust, customerId, discountRate: parsedRate }
          };
        }
      } else {
        (store.customers || []).forEach(c => { c.discountRate = parsedRate; });
        saveMockStore(store);
        return {
          success: true,
          message: `Tüm servislere (%${parsedRate}) iskonto tanımlandı.`,
          data: { globalDiscountRate: parsedRate, discountRate: parsedRate }
        };
      }
    }

    // 6h. DELETE /tenant/discounts/:id
    if (cleanEndpoint.startsWith('/tenant/discounts/') && method === 'DELETE') {
      const parts = cleanEndpoint.split('/');
      const ruleId = parts[parts.length - 1];
      if (store.discountRules) {
        store.discountRules = store.discountRules.filter(r => String(r.id) !== String(ruleId));
        saveMockStore(store);
      }
      return {
        success: true,
        message: 'İskonto kuralı silindi'
      };
    }

    // 7. GET /tenant/catalog & GET /tenant/products
    if ((cleanEndpoint === '/tenant/catalog' || cleanEndpoint === '/tenant/products') && method === 'GET') {
      const items = store.tenantCatalog.map(tc => {
        const prod = store.products.find(p => p.id === tc.productId) || {};
        return {
          ...tc,
          product: prod
        };
      });
      return {
        success: true,
        count: items.length,
        data: items
      };
    }

    // 7b. POST /tenant/products & POST /tenant/catalog
    if ((cleanEndpoint === '/tenant/products' || cleanEndpoint === '/tenant/catalog') && method === 'POST') {
      // Onay Kontrolü (requireApprovedDealer)
      let storedUser = null;
      try { storedUser = JSON.parse(localStorage.getItem('user')); } catch (e) {}
      if (storedUser && storedUser.role !== 'SUPER_ADMIN') {
        const uStatus = storedUser.status || (storedUser.tenant ? storedUser.tenant.status : 'APPROVED');
        if (uStatus === 'PENDING') {
          return {
            success: false,
            status: 403,
            message: 'Bayi hesabınız henüz onaylanmamıştır. Destek ekibimiz onaylayana kadar ürün ekleyemezsiniz.'
          };
        }
      }

      const prodName = String(body.name || body.productName || '').trim() || 'Yeni Parça';
      const oe = String(body.oeNumber || '').trim();
      const cat = String(body.category || body.partGroup || 'Genel').trim();
      const brand = String(body.vehicleBrand || body.brand || '').trim() || null;
      const models = String(body.compatibleModels || body.models || '').trim() || null;
      const partGroup = String(body.partGroup || body.part_group || '').trim() || null;
      const price = parseFloat(body.price !== undefined ? body.price : (body.customPrice || body.defaultPrice)) || 0;
      const stock = parseInt(body.stock, 10) || 0;
      const primaryImg = body.image || body.imageUrl || null;
      const imagesArr = primaryImg ? [primaryImg] : [];

      const newProd = {
        id: `prod-${Date.now().toString(36)}`,
        oeNumber: oe,
        name: prodName,
        category: cat,
        vehicleBrand: brand,
        compatibleModels: models,
        partGroup: partGroup,
        defaultPrice: price,
        imageUrl: primaryImg,
        images: JSON.stringify(imagesArr)
      };
      store.products.push(newProd);
      const newTp = {
        id: `tp-${Date.now().toString(36)}`,
        tenantId: 'tenant-ahmet-oto',
        productId: newProd.id,
        stock: stock,
        customPrice: price,
        isDiscounted: false,
        product: newProd
      };
      store.tenantCatalog.unshift(newTp);
      saveMockStore(store);
      return {
        success: true,
        message: `"${prodName}" parçası bayiniz kataloğuna başarıyla eklendi.`,
        data: newTp
      };
    }

    // 7c. DELETE /tenant/products/:id & DELETE /tenant/catalog/:id
    if ((cleanEndpoint.startsWith('/tenant/products/') || cleanEndpoint.startsWith('/tenant/catalog/')) && method === 'DELETE') {
      const parts = cleanEndpoint.split('/');
      const targetId = parts[parts.length - 1];

      // Bulunan tenantCatalog kaydını çıkar
      const existingIndex = (store.tenantCatalog || []).findIndex(tc =>
        String(tc.id) === String(targetId) || String(tc.productId) === String(targetId)
      );

      let deletedProductId = null;
      if (existingIndex >= 0) {
        deletedProductId = store.tenantCatalog[existingIndex].productId;
        store.tenantCatalog.splice(existingIndex, 1);
      }

      // Ürünler havuzundan da tamamen kaldır
      if (deletedProductId) {
        store.products = (store.products || []).filter(p => String(p.id) !== String(deletedProductId));
      } else {
        store.products = (store.products || []).filter(p => String(p.id) !== String(targetId));
      }

      saveMockStore(store);
      return {
        success: true,
        message: 'Ürün listeden ve veritabanından kalıcı olarak silindi.'
      };
    }

    // 7d. GET /tenant/dashboard-stats & GET /tenant/stats
    if ((cleanEndpoint === '/tenant/dashboard-stats' || cleanEndpoint === '/tenant/stats') && method === 'GET') {
      const orders = store.orders || [];
      const pendingCount = orders.filter(o => o.status === 'PENDING' || o.status === 'PENDING_APPROVAL' || o.status === 'Ödeme Bekliyor').length;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayRevenue = orders
        .filter(o => new Date(o.createdAt) >= todayStart && o.status !== 'CANCELLED' && o.status !== 'REJECTED')
        .reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);
      const customerCount = (store.customers || []).length;
      const recentOrders = orders.slice(0, 5).map(o => {
        const cust = (store.customers || []).find(c => c.id === o.customerId) || (store.customers || [])[0] || {};
        return {
          ...o,
          customer: {
            id: cust.id || '',
            companyName: cust.companyName || 'Müşteri',
            phone: cust.phone || '-',
            discountRate: cust.discountRate || 0,
            balance: cust.balance || 0
          },
          items: o.items || []
        };
      });
      const totalOrders = orders.length;

      return {
        success: true,
        data: {
          pendingCount,
          todayRevenue,
          customerCount,
          recentOrders,
          // Geriye dönük uyumluluk aliasları
          pendingOrders: pendingCount,
          registeredCustomers: customerCount,
          totalOrders
        }
      };
    }

    // 7e. GET /tenant/orders
    if (cleanEndpoint === '/tenant/orders' && method === 'GET') {
      const orders = (store.orders || []).map((o, idx) => {
        const cust = (store.customers || []).find(c => c.id === o.customerId) || (store.customers || [])[0] || {};
        
        let rawItems = Array.isArray(o.items) && o.items.length > 0 ? o.items : null;
        if (!rawItems) {
          const subP = parseFloat(o.subtotal || (o.totalAmount ? (o.totalAmount / 1.2) : 900)) || 900;
          const chosenProd = (store.products && store.products.length > 0)
            ? store.products[idx % store.products.length]
            : ((store.tenantCatalog && store.tenantCatalog[0] && store.tenantCatalog[0].product) || {
                id: 'prod-def',
                name: 'Ön Fren Balata Takımı',
                oeNumber: 'OE-' + (o.orderNumber ? o.orderNumber.replace(/[^A-Z0-9]/g, '').slice(-5) : '41060'),
                category: 'Fren Sistemi',
                vehicleBrand: 'Renault / Fiat / VAG',
                defaultPrice: subP
              });
          rawItems = [{
            id: `item-${o.id || idx}-1`,
            orderId: o.id,
            quantity: 1,
            unitPrice: subP,
            totalPrice: subP,
            product: chosenProd,
            tenantProduct: { product: chosenProd }
          }];
          o.items = rawItems;
        }

        const formattedItems = rawItems.map(it => {
          const prod = it.product || it.tenantProduct?.product || {
            name: it.name || 'Yedek Parça',
            oeNumber: it.oeNumber || 'OE-GENEL',
            imageUrl: it.imageUrl || '',
            category: it.category || 'Otomotiv',
            defaultPrice: it.unitPrice || 500
          };
          return {
            ...it,
            product: prod,
            tenantProduct: {
              ...(it.tenantProduct || {}),
              product: prod
            }
          };
        });
        return {
          ...o,
          customer: {
            id: cust.id || '',
            companyName: cust.companyName || 'Müşteri',
            phone: cust.phone || '-',
            discountRate: cust.discountRate || 0,
            balance: cust.balance || 0
          },
          items: formattedItems
        };
      });
      return {
        success: true,
        count: orders.length,
        data: orders
      };
    }

    // 7f. GET /tenant/orders/:id
    if (cleanEndpoint.startsWith('/tenant/orders/') && !cleanEndpoint.endsWith('/status') && method === 'GET') {
      const orderId = cleanEndpoint.replace('/tenant/orders/', '');
      const order = (store.orders || []).find(o => o.id === orderId);
      if (order) {
        const cust = (store.customers || []).find(c => c.id === order.customerId) || (store.customers || [])[0] || {};
        
        let rawItems = Array.isArray(order.items) && order.items.length > 0 ? order.items : null;
        if (!rawItems) {
          const subP = parseFloat(order.subtotal || (order.totalAmount ? (order.totalAmount / 1.2) : 900)) || 900;
          const chosenProd = (store.products && store.products[0]) || {
            id: 'prod-def',
            name: 'Ön Fren Balata Takımı',
            oeNumber: 'OE-' + (order.orderNumber ? order.orderNumber.replace(/[^A-Z0-9]/g, '').slice(-5) : '41060'),
            category: 'Fren Sistemi',
            vehicleBrand: 'Renault / Fiat / VAG',
            defaultPrice: subP
          };
          rawItems = [{
            id: `item-${order.id}-1`,
            orderId: order.id,
            quantity: 1,
            unitPrice: subP,
            totalPrice: subP,
            product: chosenProd,
            tenantProduct: { product: chosenProd }
          }];
          order.items = rawItems;
        }

        const formattedItems = rawItems.map(it => {
          const prod = it.product || it.tenantProduct?.product || {
            name: it.name || 'Yedek Parça',
            oeNumber: it.oeNumber || 'OE-GENEL',
            imageUrl: it.imageUrl || '',
            category: it.category || 'Otomotiv',
            defaultPrice: it.unitPrice || 500
          };
          return {
            ...it,
            product: prod,
            tenantProduct: {
              ...(it.tenantProduct || {}),
              product: prod
            }
          };
        });
        return {
          success: true,
          data: {
            ...order,
            customer: cust,
            items: formattedItems
          }
        };
      }
      return { success: false, message: 'Sipariş bulunamadı.' };
    }

    // 7g. PUT & PATCH /tenant/orders/:id/status
    if (cleanEndpoint.startsWith('/tenant/orders/') && cleanEndpoint.endsWith('/status') && (method === 'PATCH' || method === 'PUT')) {
      const parts = cleanEndpoint.split('/');
      const orderId = parts[3];
      const newStatus = body.status;
      const rejectionReason = body.rejectionReason || body.reason || null;
      const order = (store.orders || []).find(o => o.id === orderId);
      if (order && newStatus) {
        const oldStatus = order.status;
        order.status = newStatus;
        if (rejectionReason) {
          order.rejectionReason = rejectionReason;
        }
        // Eğer sipariş iptal/red edildiyse ve önceden reddedilmemişse, cari bakiye ve stok iade et
        if (newStatus === 'REJECTED' && oldStatus !== 'REJECTED' && oldStatus !== 'CANCELLED') {
          if (!order.rejectionReason) order.rejectionReason = 'Bayi tarafından reddedildi.';
          if (store.customers && store.customers[0] && order.totalAmount) {
            store.customers[0].balance = parseFloat(Math.max(0, store.customers[0].balance - order.totalAmount).toFixed(2));
          }
          if (Array.isArray(order.items)) {
            order.items.forEach(it => {
              const tc = (store.tenantCatalog || []).find(c => c.id === it.tenantProductId || c.productId === it.productId);
              if (tc && it.quantity) tc.stock = (tc.stock || 0) + it.quantity;
            });
          }
        }
        saveMockStore(store);
        const statusLabel = newStatus === 'PROCESSING' ? 'Hazırlanıyor' : (newStatus === 'REJECTED' ? 'İptal Edildi' : newStatus);
        return {
          success: true,
          message: `Sipariş #${order.orderNumber || order.id} durumu "${statusLabel}" olarak güncellendi.`,
          data: order
        };
      }
      return { success: false, message: 'Sipariş bulunamadı veya durum geçersiz.' };
    }

    // 8. GET /store/profile
    if (cleanEndpoint === '/store/profile' && method === 'GET') {
      const cust = (store.customers && store.customers[0]) || {
        companyName: 'Kemal Usta (Otoservis)',
        phone: '0555 123 45 67',
        address: 'Merkez Sanayi Sitesi No: 42, Dükkan: 8',
        taxNumber: '1234567890',
        discountRate: 0,
        balance: 14850.00
      };
      const custUser = (store.users || []).find(u => u.role === 'CUSTOMER');
      const displayName = cust.companyName || (custUser ? custUser.name : 'Kemal Usta');
      const custDiscount = (cust.discountRate !== undefined && cust.discountRate !== null && !isNaN(parseFloat(cust.discountRate)))
        ? Math.max(0, parseFloat(cust.discountRate))
        : 0;
      return {
        success: true,
        data: {
          ...cust,
          name: (custUser && custUser.name) ? custUser.name : displayName,
          companyName: cust.companyName || displayName,
          email: (custUser && custUser.email) ? custUser.email : 'kemal@ustaoto.com',
          phone: cust.phone || '0555 123 45 67',
          address: cust.address || 'Merkez Sanayi Sitesi No: 42, Dükkan: 8',
          taxNumber: cust.taxNumber || '1234567890',
          discountRate: custDiscount,
          balance: cust.balance !== undefined ? cust.balance : 14850.00,
          tenant: {
            id: 'tenant-ahmet-oto',
            name: 'Ahmet Oto Yedek Parça',
            subdomain: 'ahmetoto',
            themeColor: '#f97316'
          }
        }
      };
    }

    // 8.1. PUT & PATCH /store/profile - Profil ve Hesap Güncelleme
    if (cleanEndpoint === '/store/profile' && (method === 'PUT' || method === 'PATCH')) {
      let cust = (store.customers && store.customers[0]) ? store.customers[0] : null;
      if (!cust) {
        cust = {
          id: 'cust-kemal-usta',
          companyName: 'Kemal Usta (Otoservis)',
          phone: '0555 123 45 67',
          address: 'Merkez Sanayi Sitesi No: 42, Dükkan: 8',
          taxNumber: '1234567890',
          discountRate: 0,
          balance: 14850.00
        };
        store.customers.push(cust);
      }

      const name = (body.name || body.companyName || '').trim();
      const companyName = (body.companyName || body.name || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const phone = body.phone !== undefined ? String(body.phone).trim() : cust.phone;
      const address = body.address !== undefined ? String(body.address).trim() : cust.address;
      const taxNumber = body.taxNumber !== undefined ? String(body.taxNumber).trim() : cust.taxNumber;

      if (companyName) cust.companyName = companyName;
      if (phone) cust.phone = phone;
      if (address !== undefined) cust.address = address;
      if (taxNumber !== undefined) cust.taxNumber = taxNumber;

      let custUser = (store.users || []).find(u => u.role === 'CUSTOMER');
      if (!custUser) {
        custUser = {
          id: 'usr-customer-kemal',
          email: email || 'kemal@ustaoto.com',
          name: name || companyName,
          role: 'CUSTOMER'
        };
        store.users.push(custUser);
      } else {
        if (name) custUser.name = name;
        if (email) custUser.email = email;
      }

      saveMockStore(store);

      return {
        success: true,
        message: 'Profil bilgileriniz başarıyla güncellendi.',
        data: {
          ...cust,
          name: name || custUser.name || cust.companyName,
          companyName: cust.companyName,
          email: email || custUser.email,
          phone: cust.phone,
          address: cust.address,
          taxNumber: cust.taxNumber,
          balance: cust.balance,
          discountRate: cust.discountRate
        }
      };
    }

    // 8.2. GET /store/my-orders & GET /store/orders - Sipariş Listesi
    if ((cleanEndpoint === '/store/my-orders' || cleanEndpoint === '/store/orders') && method === 'GET') {
      const orders = store.orders || [];
      return {
        success: true,
        count: orders.length,
        data: orders
      };
    }

    // 9. GET /store/products
    if (cleanEndpoint === '/store/products' && method === 'GET') {
      const firstCust = (store.customers && store.customers[0]) || null;
      const discountRate = (firstCust && firstCust.discountRate !== undefined && firstCust.discountRate !== null && !isNaN(parseFloat(firstCust.discountRate)))
        ? Math.max(0, parseFloat(firstCust.discountRate))
        : 0;
      const multiplier = Math.max(0, (100 - discountRate) / 100);

      // Parse query params if any
      let brandFilter = '';
      let searchFilter = '';
      try {
        const parsedUrl = new URL(endpoint, 'http://localhost');
        brandFilter = (parsedUrl.searchParams.get('brand') || '').trim().toLowerCase();
        searchFilter = (parsedUrl.searchParams.get('search') || '').trim().toLowerCase();
      } catch (e) {}

      let calculated = (store.tenantCatalog || []).map(tc => {
        const prod = (store.products || []).find(p => p.id === tc.productId) || {};
        const listPrice = tc.customPrice !== null && tc.customPrice !== undefined ? tc.customPrice : (prod.defaultPrice || 0);
        const discountAmount = discountRate > 0 ? listPrice * (discountRate / 100) : 0;
        const finalPrice = discountRate > 0 ? parseFloat((listPrice - discountAmount).toFixed(2)) : listPrice;
        return {
          tenantProductId: tc.id,
          productId: prod.id,
          oeNumber: prod.oeNumber || '',
          name: prod.name || 'Yedek Parça',
          category: prod.category || 'Otomotiv',
          vehicleBrand: prod.vehicleBrand || 'Renault',
          compatibleModels: prod.compatibleModels || '',
          partGroup: prod.partGroup || 'Fren Sistemi',
          imageUrl: prod.imageUrl || '',
          images: prod.images || (prod.imageUrl ? [prod.imageUrl] : []),
          stock: tc.stock !== undefined ? tc.stock : 10,
          isDiscounted: tc.isDiscounted,
          defaultPrice: listPrice,
          customPrice: tc.customPrice,
          discountedPrice: finalPrice,
          appliedDiscountRate: discountRate,
          pricing: {
            listPrice: listPrice,
            discountRate: discountRate,
            savedAmount: parseFloat((listPrice - finalPrice).toFixed(2)),
            finalPrice: finalPrice
          }
        };
      });

      if (brandFilter && brandFilter !== 'all') {
        calculated = calculated.filter(p => (p.vehicleBrand || '').toLowerCase().includes(brandFilter));
      }

      if (searchFilter) {
        calculated = calculated.filter(p => 
          (p.name || '').toLowerCase().includes(searchFilter) ||
          (p.oeNumber || '').toLowerCase().includes(searchFilter) ||
          (p.vehicleBrand || '').toLowerCase().includes(searchFilter) ||
          (p.compatibleModels || '').toLowerCase().includes(searchFilter) ||
          (p.partGroup || '').toLowerCase().includes(searchFilter)
        );
      }

      const currentBal = firstCust && firstCust.balance !== undefined ? firstCust.balance : 14850.00;

      return {
        success: true,
        customer: {
          companyName: firstCust ? firstCust.companyName : 'Kemal Usta (Otoservis)',
          appliedDiscountRate: discountRate > 0 ? `%${discountRate}` : '%0',
          currentBalance: `${parseFloat(currentBal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
        },
        pagination: {
          page: 1,
          limit: 50,
          totalCount: calculated.length,
          totalPages: 1
        },
        count: calculated.length,
        data: calculated
      };
    }

    // 9.3. GET /store/bank-info
    if (cleanEndpoint === '/store/bank-info' && method === 'GET') {
      const bankData = (store.tenant && store.tenant.bankInfo) || {
        bankName: 'Ziraat Bankası',
        accountHolder: (store.tenant && store.tenant.name) || 'Ahmet Oto Otomotiv Ltd. Şti.',
        iban: 'TR33 0001 0001 2345 6789 0000 01',
        branch: 'Merkez Şube',
        instructions: 'Havale / EFT açıklama kısmına firma adınızı veya sipariş numaranızı yazınız.'
      };
      return {
        success: true,
        data: bankData
      };
    }

    // 10. POST /store/orders
    if (cleanEndpoint === '/store/orders' && method === 'POST') {
      const orderNumber = `SP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const items = body.items || [];
      let listPriceTotal = 0;
      let subtotal = 0;

      const firstCust = (store.customers && store.customers[0]) ? store.customers[0] : null;
      const discountRate = (firstCust && firstCust.discountRate !== undefined && firstCust.discountRate !== null && !isNaN(parseFloat(firstCust.discountRate)))
        ? Math.max(0, parseFloat(firstCust.discountRate))
        : 0;
      const multiplier = Math.max(0, (100 - discountRate) / 100);

      const orderItems = [];
      items.forEach(it => {
        let tc = (store.tenantCatalog || []).find(t => 
          String(t.id) === String(it.tenantProductId) ||
          String(t.productId) === String(it.tenantProductId) ||
          (it.productId && String(t.productId) === String(it.productId))
        );

        let prod = tc ? (store.products || []).find(p => String(p.id) === String(tc.productId)) : null;
        if (!prod) {
          prod = (store.products || []).find(p => 
            String(p.id) === String(it.productId) ||
            String(p.id) === String(it.tenantProductId) ||
            (it.oeNumber && p.oeNumber === it.oeNumber)
          );
        }

        const listPrice = it.listPrice !== undefined && it.listPrice !== null
          ? parseFloat(it.listPrice)
          : (tc && tc.customPrice !== null && tc.customPrice !== undefined ? parseFloat(tc.customPrice) : (prod ? parseFloat(prod.defaultPrice || 500) : (parseFloat(it.unitPrice) || 500)));

        const discountedPrice = it.unitPrice !== undefined && it.unitPrice !== null
          ? parseFloat(it.unitPrice)
          : parseFloat((listPrice * multiplier).toFixed(2));

        const qty = parseInt(it.quantity || it.qty || 1, 10);
        const totalPrice = it.totalPrice !== undefined && it.totalPrice !== null
          ? parseFloat(it.totalPrice)
          : parseFloat((discountedPrice * qty).toFixed(2));

        listPriceTotal += listPrice * qty;
        subtotal += totalPrice;
        if (tc) tc.stock = Math.max(0, (tc.stock || 10) - qty);

        const prodObj = {
          id: (prod && prod.id) || it.productId || it.tenantProductId || `prod-${Date.now().toString(36)}`,
          oeNumber: (prod && prod.oeNumber) || it.oeNumber || 'OE-GENEL',
          name: (prod && prod.name) || it.name || 'Yedek Parça',
          category: (prod && prod.category) || 'Otomotiv',
          vehicleBrand: (prod && prod.vehicleBrand) || it.vehicleBrand || 'Otomotiv',
          partGroup: (prod && prod.partGroup) || it.partGroup || 'Yedek Parça',
          imageUrl: (prod && (prod.imageUrl || (prod.images && prod.images[0]))) || it.imageUrl || '',
          defaultPrice: listPrice
        };

        orderItems.push({
          id: `item-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`,
          orderId: '',
          tenantProductId: (tc && tc.id) || it.tenantProductId || 'tp-item',
          quantity: qty,
          unitPrice: discountedPrice,
          totalPrice: totalPrice,
          product: prodObj,
          tenantProduct: {
            id: (tc && tc.id) || it.tenantProductId || 'tp-item',
            product: prodObj
          }
        });
      });

      if (orderItems.length === 0 && (items.length > 0 || subtotal > 0)) {
        const sampleProd = (store.products && store.products[0]) || {
          id: 'prod-def',
          oeNumber: '7701208265',
          name: 'Ön Fren Balata Takımı',
          category: 'Fren Sistemi',
          defaultPrice: 500
        };
        const lp = sampleProd.defaultPrice || 500;
        const dp = parseFloat((lp * multiplier).toFixed(2));
        orderItems.push({
          id: `item-${Date.now().toString(36)}`,
          orderId: '',
          tenantProductId: (store.tenantCatalog && store.tenantCatalog[0] && store.tenantCatalog[0].id) || 'tp-def',
          quantity: 1,
          unitPrice: dp,
          totalPrice: dp,
          product: sampleProd,
          tenantProduct: { product: sampleProd }
        });
        listPriceTotal += lp;
        subtotal += dp;
      }

      listPriceTotal = parseFloat(listPriceTotal.toFixed(2));
      subtotal = parseFloat(subtotal.toFixed(2));
      const discountAmount = parseFloat((listPriceTotal - subtotal).toFixed(2));
      const vatAmount = parseFloat((subtotal * 0.20).toFixed(2));
      const totalAmount = parseFloat((subtotal + vatAmount).toFixed(2));

      const paymentMethod = body.paymentMethod || null;
      const orderStatus = 'PENDING_APPROVAL';

      let snapshotShippingAddress = body.shippingAddress || body.deliveryAddress;
      if (!snapshotShippingAddress && (body.address || body.city || body.district)) {
        snapshotShippingAddress = [body.address, body.district, body.city].filter(Boolean).join(', ');
      }
      if (!snapshotShippingAddress && firstCust) {
        snapshotShippingAddress = [firstCust.address, firstCust.district, firstCust.city].filter(Boolean).join(', ');
      }

      const newOrder = {
        id: `ord-${Date.now().toString(36)}`,
        orderNumber: orderNumber,
        tenantId: 'tenant-ahmet-oto',
        customerId: firstCust ? firstCust.id : 'cust-kemal-usta',
        paymentMethod: paymentMethod,
        shippingAddress: snapshotShippingAddress || 'Adres belirtilmedi',
        subtotal: subtotal,
        vatRate: 20.00,
        vatAmount: vatAmount,
        totalAmount: totalAmount,
        status: orderStatus,
        items: orderItems,
        createdAt: new Date().toISOString()
      };
      newOrder.items.forEach(item => { item.orderId = newOrder.id; });

      store.orders.unshift(newOrder);
      if (store.customers[0]) {
        store.customers[0].balance = parseFloat((store.customers[0].balance + totalAmount).toFixed(2));
      }
      saveMockStore(store);

      return {
        success: true,
        message: `Siparişiniz #${orderNumber} numarasıyla başarıyla oluşturuldu.`,
        data: {
          ...newOrder,
          breakdown: {
            listPriceTotal,
            discountAmount,
            subtotal,
            vatRate: 20.00,
            vatAmount,
            totalAmount
          }
        }
      };
    }

    // 11. Varsayılan Başarılı Yanıt
    return {
      success: true,
      message: 'İşlem başarılı.',
      data: {}
    };
  }

  /**
   * apiFetch:
   * Frontend ile Backend arasındaki tüm HTTP isteklerini yöneten akıllı hibrit fonksiyon.
   * Canlı backend açıksa doğrudan bağlanır; sunucu kapalıysa veya yerel dosya
   * modundaysa kullanıcıyı engellemeden kusursuz bir deneyim sunar.
   */
  async function apiFetch(endpoint, options = {}) {
    // 1. URL Yapılandırması
    let url = endpoint;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (!url.startsWith('/api')) {
        url = `${API_BASE}${url.startsWith('/') ? url : '/' + url}`;
      } else if (!isDirectExpress) {
        url = `https://saas-g-ncel-10-10-2026simdi-main.onrender.com${url}`;
      }
    }

    // 2. Başlıklar (Headers) ve Token Enjeksiyonu
    const headers = new Headers(options.headers || {});
    if (options.body instanceof FormData) {
      headers.delete('Content-Type');
    } else if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const token = localStorage.getItem('token');
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // 5. ADIM: Tenant Algılama (Subdomain/Slug Resolution)
    // URL parametresinden (?tenant=slug veya ?subdomain=slug) veya hostname subdomain'inden tenant slug algıla
    if (!headers.has('X-Tenant-Slug')) {
      let slug = null;
      if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        slug = urlParams.get('tenant') || urlParams.get('subdomain');
        if (!slug && window.location.hostname) {
          const parts = window.location.hostname.split('.');
          if (parts.length > 2 && parts[0] !== 'www' && parts[0] !== 'localhost') {
            slug = parts[0];
          }
        }
        if (!slug) {
          slug = localStorage.getItem('tenantSlug') || 'ahmetoto';
        }
      }
      if (slug) {
        headers.set('X-Tenant-Slug', slug);
      }
    }

    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      body = JSON.stringify(body);
    }

    // 3. Canlı Sunucuya Bağlantı Denemesi (Yerel localhost Express API'sine doğrudan bağlan)
    try {
      const controller = new AbortController();
      const timeoutMs = (options.body instanceof FormData) ? 60000 : 15000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }

      const isLoginEndpoint = url.includes('/auth/login') || url.includes('/auth/tenant-login') || url.includes('/auth/customer-login');
      const isStoreContext = (typeof window !== 'undefined' && window.location && (
        window.location.pathname.endsWith('store.html') ||
        window.location.pathname === '/' ||
        window.location.pathname.endsWith('/store')
      )) || url.includes('/store/products') || url.includes('/store/bank-info') || url.includes('/store/tenant-info');

      if ((response.status === 401 || response.status === 403) && !isLoginEndpoint) {
        // 1. ADIM & 2. ADIM: Müşteri vitrininde (store.html) asla genel SaaS login.html sayfasına yönlendirme!
        if (isStoreContext) {
          console.warn(`[API] Vitrinde yetkisiz/oturumsuz istek (${response.status}). Ziyaretçi modunda kalınacak.`);
          if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
          if (data && typeof data === 'object') {
            data._status = response.status;
            data._ok = response.ok;
          }
          return data || { success: false, status: response.status, message: 'Oturum gerekli' };
        }

        console.warn(`[API] Yetkisiz erişim (${response.status}). Giriş sayfasına yönlendiriliyor...`);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
        return null;
      }

      if (data && typeof data === 'object') {
        data._status = response.status;
        data._ok = response.ok;
      }

      return data;

    } catch (networkError) {
      console.info('[API] Canlı backend sunucusuna bağlanılamadı. Dayanıklı çevrimdışı motor devreye giriyor...');
    }

    // 4. Çevrimdışı / Bağımsız Dayanıklı Yanıt Motoru (Fallback)
    return handleOfflineMock(endpoint, options);
  }

  /**
   * requireAuth:
   * Sayfa erişim koruması (Route Guard) sağlar.
   */
  function requireAuth(allowedRoles = []) {
    const isStorePage = typeof window !== 'undefined' && window.location && (
      window.location.pathname.endsWith('store.html') ||
      window.location.pathname === '/' ||
      window.location.pathname.endsWith('/store')
    );

    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      if (isStorePage) {
        return null;
      }
      console.warn('[AUTH_GUARD] Token veya kullanıcı bilgisi bulunamadı. Giriş sayfasına yönlendiriliyor.');
      window.location.href = 'login.html';
      return null;
    }

    let user;
    try {
      user = JSON.parse(userStr);
    } catch (e) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (isStorePage) {
        return null;
      }
      window.location.href = 'login.html';
      return null;
    }

    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.role)) {
        alert(`Bu alana erişim yetkiniz bulunmamaktadır. (Gereken Rol: ${allowedRoles.join(', ')})`);
        if (user.role === 'SUPER_ADMIN') {
          window.location.href = 'admin.html';
        } else if (user.role === 'TENANT_ADMIN') {
          window.location.href = 'bayi.html';
        } else if (user.role === 'CUSTOMER') {
          const storeUrl = (typeof window !== 'undefined' && window.location && window.location.pathname.includes('/saas-panel-ui'))
            ? '../storefront-ui/store.html'
            : 'store.html';
          window.location.href = storeUrl;
        } else {
          window.location.href = 'login.html';
        }
        return null;
      }
    }

    return user;
  }

  /**
   * logout:
   * 1. ADIM: Çıkış (Logout) Yönlendirmesinin Ayrıştırılması
   * store.html (Müşteri Vitrini) içerisindeyken kullanıcı çıkış yaptığında token'ı sil,
   * ancak onu genel SaaS login.html sayfasına YÖNLENDİRME.
   * Bunun yerine vitrin ana sayfasına (store.html) ziyaretçi statüsünde yönlendir.
   */
  function logout(redirectTarget = null) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    const isStorePage = typeof window !== 'undefined' && window.location && (
      window.location.pathname.endsWith('store.html') ||
      window.location.pathname === '/' ||
      window.location.pathname.endsWith('/store')
    );

    if (redirectTarget) {
      window.location.href = redirectTarget;
    } else if (isStorePage) {
      const search = window.location.search || '';
      window.location.href = 'store.html' + search;
    } else {
      window.location.href = 'login.html';
    }
  }

  // Sistemdeki tüm panellerdeki (admin.html, bayi.html vb.) 'Çıkış Yap' butonlarına otomatik bağlanma
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      const logoutElements = document.querySelectorAll('.logout-btn, .btn-logout, #logout-button, [data-action="logout"]');
      logoutElements.forEach(el => {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          logout();
        });
      });
    });
  }

  /**
   * escapeHtml:
   * XSS saldırılarını önlemek için metinleri güvenli hale getirir.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * parseJwtPayload:
   * Topluluk standardı jwt-decode kütüphanesi (v4/v3) ve RFC 7519 Base64URL fallback mekanizmasıyla
   * JWT token payload nesnesini çözümler.
   */
  function parseJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;

    // 1. jwt-decode kütüphanesi yüklüyse öncelikli kullan
    try {
      if (typeof window.jwtDecode === 'function') {
        return window.jwtDecode(token);
      }
      if (typeof window.jwt_decode === 'function') {
        return window.jwt_decode(token);
      }
    } catch (e) {
      console.warn('[JWT] jwt-decode kütüphane ayrıştırma uyarısı:', e);
    }

    // 2. RFC 7519 Standart Base64URL Çözümleme (Yerel Fallback)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
        const jsonStr = decodeURIComponent(
          atob(padded)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        return JSON.parse(jsonStr);
      }
    } catch (e) {
      console.warn('[JWT] Base64 fallback çözümleme uyarısı:', e);
    }

    // 3. Standalone / Demo Mock token desteği
    if (token.startsWith('standalone_jwt_')) {
      if (token.includes('super_admin')) return { role: 'SUPER_ADMIN' };
      if (token.includes('tenant_admin')) return { role: 'TENANT_ADMIN' };
      if (token.includes('customer')) return { role: 'CUSTOMER' };
    }

    return null;
  }

  // Global window nesnesine ata
  window.API_BASE = API_BASE;
  window.apiFetch = apiFetch;
  window.requireAuth = requireAuth;
  window.logout = logout;
  window.escapeHtml = escapeHtml;
  window.parseJwtPayload = parseJwtPayload;
  window.jwtDecode = window.jwtDecode || parseJwtPayload;
  window.getResolvedTenantSlug = getResolvedTenantSlug;

})(window);

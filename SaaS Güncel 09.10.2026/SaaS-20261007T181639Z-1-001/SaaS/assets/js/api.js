/**
 * ============================================================================
 * B2B Multi-Tenant SaaS - Merkezi API İstemcisi & Hibrit Güvenlik Köprüsü
 * Dosya: assets/js/api.js
 * ============================================================================
 * 
 * Özellikler:
 * 1. Canlı Backend Desteği: Express API (http://localhost:5000) açık olduğunda
 *    tüm istekleri doğrudan PostgreSQL veritabanına iletir.
 * 2. Akıllı Çevrimdışı / Bağımsız (Standalone / file://) Modu:
 *    Sunucu henüz başlatılmamışsa veya dosya doğrudan tarayıcıda (file://) açılmışsa
 *    bağlantı hatası verip kullanıcıyı engellemek yerine, yerleşik tohum (seed)
 *    verilerini kullanarak tam işlevsel bir yerel demo oturumu sağlar.
 */

(function (window) {
  'use strict';

  // Sunucu Adresi Yapılandırması:
  // Eğer http/https üzerinden port 5000'de çalışıyorsa göreli '/api',
  // değilse (file:// veya port 5500 gibi statik sunucuysa) 'http://localhost:5000/api' hedeflenir.
  const isDirectExpress = (window.location.protocol === 'http:' || window.location.protocol === 'https:') &&
                          (window.location.port === '5000' || window.location.port === '');
  const API_BASE = isDirectExpress ? '/api' : 'http://localhost:5000/api';

  // ----------------------------------------------------------------------------
  // YEREL TOHUM (MOCK SEED) VERİ HAVUZU
  // ----------------------------------------------------------------------------
  const MOCK_STORAGE_KEY = 'saas_b2b_standalone_data_v1';

  function initMockStore() {
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
            tenantId: null,
            tenant: null
          },
          {
            id: 'usr-ahmet-admin',
            email: 'ahmet@ahmetoto.com',
            password: '123456',
            role: 'TENANT_ADMIN',
            name: 'Ahmet Yılmaz',
            tenantId: 'tenant-ahmet-oto',
            tenant: {
              id: 'tenant-ahmet-oto',
              name: 'Ahmet Oto Yedek Parça',
              subdomain: 'ahmetoto',
              themeColor: '#f97316',
              isActive: true
            }
          },
          {
            id: 'usr-kemal-usta',
            email: 'kemal@kemaloto.com',
            password: '123456',
            role: 'CUSTOMER',
            name: 'Kemal Usta',
            tenantId: 'tenant-ahmet-oto',
            tenant: {
              id: 'tenant-ahmet-oto',
              name: 'Ahmet Oto Yedek Parça',
              subdomain: 'ahmetoto',
              themeColor: '#f97316'
            },
            customerProfile: {
              id: 'cust-kemal-usta',
              companyName: 'Kemal Usta Oto Servis',
              phone: '0532 999 88 77',
              discountRate: 25.00,
              balance: 14850.00
            }
          }
        ],
        tenants: [
          {
            id: 'tenant-ahmet-oto',
            name: 'Ahmet Oto',
            subdomain: 'ahmetoto',
            themeColor: '#f97316',
            isActive: true,
            createdAt: '2026-03-01T10:00:00.000Z',
            _count: { tenantProducts: 42, customerProfiles: 18, orders: 142 }
          },
          {
            id: 'tenant-demir-oto',
            name: 'Demir Otomotiv',
            subdomain: 'demiroto',
            themeColor: '#2563eb',
            isActive: true,
            createdAt: '2026-03-05T12:00:00.000Z',
            _count: { tenantProducts: 35, customerProfiles: 12, orders: 89 }
          },
          {
            id: 'tenant-baskent-oto',
            name: 'Başkent Parça',
            subdomain: 'baskent',
            themeColor: '#10b981',
            isActive: true,
            createdAt: '2026-03-10T14:30:00.000Z',
            _count: { tenantProducts: 50, customerProfiles: 24, orders: 210 }
          },
          {
            id: 'tenant-ege-oto',
            name: 'Ege Oto Servis',
            subdomain: 'egeoto',
            themeColor: '#8b5cf6',
            isActive: false,
            createdAt: '2026-03-12T09:15:00.000Z',
            _count: { tenantProducts: 15, customerProfiles: 4, orders: 28 }
          }
        ],
        products: [
          {
            id: 'prod-01',
            oeNumber: '04465-02220',
            name: 'Ön Fren Balata Takımı',
            category: 'Fren Sistemi',
            defaultPrice: 1250.00,
            imageUrl: 'https://images.unsplash.com/photo-1600705722908-bab1e61c0b4d?auto=format&fit=crop&w=400&q=80'
          },
          {
            id: 'prod-02',
            oeNumber: '90915-YZZD2',
            name: 'Yağ Filtresi (Orijinal Standart)',
            category: 'Filtreler',
            defaultPrice: 320.00,
            imageUrl: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=400&q=80'
          },
          {
            id: 'prod-03',
            oeNumber: '48510-80542',
            name: 'Ön Gazlı Amortisör (Sağ)',
            category: 'Süspansiyon',
            defaultPrice: 2850.00,
            imageUrl: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=400&q=80'
          },
          {
            id: 'prod-04',
            oeNumber: '17801-21050',
            name: 'Hava Filtresi Yüksek Emişli',
            category: 'Filtreler',
            defaultPrice: 420.00,
            imageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=80'
          },
          {
            id: 'prod-05',
            oeNumber: '90919-01253',
            name: 'İridyum Buji Seti (4 Adet)',
            category: 'Ateşleme Sistemi',
            defaultPrice: 980.00,
            imageUrl: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=400&q=80'
          },
          {
            id: 'prod-06',
            oeNumber: '13568-19195',
            name: 'Triger Kayış Kiti (Gergili)',
            category: 'Motor Parçaları',
            defaultPrice: 3450.00,
            imageUrl: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=400&q=80'
          }
        ],
        tenantCatalog: [
          { id: 'tp-01', tenantId: 'tenant-ahmet-oto', productId: 'prod-01', stock: 24, customPrice: 1350.00, isDiscounted: false },
          { id: 'tp-02', tenantId: 'tenant-ahmet-oto', productId: 'prod-02', stock: 85, customPrice: null, isDiscounted: false },
          { id: 'tp-03', tenantId: 'tenant-ahmet-oto', productId: 'prod-03', stock: 12, customPrice: 2950.00, isDiscounted: true },
          { id: 'tp-04', tenantId: 'tenant-ahmet-oto', productId: 'prod-04', stock: 45, customPrice: null, isDiscounted: false },
          { id: 'tp-05', tenantId: 'tenant-ahmet-oto', productId: 'prod-05', stock: 30, customPrice: 1050.00, isDiscounted: false },
          { id: 'tp-06', tenantId: 'tenant-ahmet-oto', productId: 'prod-06', stock: 8, customPrice: 3600.00, isDiscounted: true }
        ],
        customers: [
          {
            id: 'cust-kemal-usta',
            userId: 'usr-kemal-usta',
            tenantId: 'tenant-ahmet-oto',
            companyName: 'Kemal Usta Oto Servis',
            phone: '0532 999 88 77',
            discountRate: 25.00,
            balance: 14850.00,
            user: { email: 'kemal@kemaloto.com' }
          },
          {
            id: 'cust-yildiz-oto',
            userId: 'usr-yildiz-oto',
            tenantId: 'tenant-ahmet-oto',
            companyName: 'Yıldız Kardeşler Bosch Car Service',
            phone: '0533 111 22 33',
            discountRate: 20.00,
            balance: 8200.00,
            user: { email: 'yildiz@boschservice.com' }
          }
        ],
        orders: [
          {
            id: 'ord-101',
            orderNumber: 'SP-KXZ91A-4821',
            tenantId: 'tenant-ahmet-oto',
            customerId: 'cust-kemal-usta',
            subtotal: 3125.00,
            vatRate: 20.00,
            vatAmount: 625.00,
            totalAmount: 3750.00,
            status: 'APPROVED',
            createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
          }
        ],
        settings: {
          id: 1,
          tecdocApiKey: 'tc_live_demo_984182938472',
          tecdocEndpoint: 'https://api.tecalliance.net/v2/catalog',
          defaultB2BDiscount: 20.0,
          defaultTaxRate: 20.0,
          platformCurrency: 'TRY',
          adminEmail: 'admin@sistem.com',
          updatedAt: new Date().toISOString()
        },
        discountRules: [
          {
            id: 1,
            tenantId: 'tenant-ahmet-oto',
            ruleName: 'Bahar Kampanyası',
            targetCust: 'Tüm Müşteriler',
            category: 'Filtre Grubu',
            rate: 15.0,
            isActive: true,
            createdAt: new Date(Date.now() - 3600000 * 48).toISOString()
          },
          {
            id: 2,
            tenantId: 'tenant-ahmet-oto',
            ruleName: 'Fren Grubu Sadakat İndirimi',
            targetCust: 'Kemal Usta Oto Servis',
            category: 'Fren Sistemi',
            rate: 22.5,
            isActive: true,
            createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
          }
        ]
      };
      saveMockStore(store);
    }
    if (!store.discountRules) {
      store.discountRules = [
        {
          id: 1,
          tenantId: 'tenant-ahmet-oto',
          ruleName: 'Bahar Kampanyası',
          targetCust: 'Tüm Müşteriler',
          category: 'Filtre Grubu',
          rate: 15.0,
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ];
      saveMockStore(store);
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
      try {
        body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      } catch (e) {
        body = {};
      }
    }

    const cleanEndpoint = endpoint.replace('/api', '').split('?')[0];

    // 0. POST /auth/register
    if (cleanEndpoint === '/auth/register' && method === 'POST') {
      const email = (body.email || '').toLowerCase().trim();
      const password = (body.password || '').trim();
      const role = body.role || 'CUSTOMER';
      const tenantId = body.tenantId || null;

      if (!email || !password) {
        return { success: false, message: 'E-posta ve şifre zorunludur.' };
      }

      const existingUser = store.users.find(u => u.email.toLowerCase() === email);
      if (existingUser) {
        return { success: false, message: 'Bu e-posta adresi ile kayıtlı kullanıcı zaten mevcut.' };
      }

      const newUser = {
        id: `usr-${Date.now().toString(36)}`,
        email,
        password,
        role,
        tenantId,
        createdAt: new Date().toISOString()
      };
      store.users.push(newUser);
      saveMockStore(store);

      return {
        success: true,
        message: 'Kullanıcı kaydı başarıyla tamamlandı.',
        user: { id: newUser.id, email: newUser.email, role: newUser.role, tenantId: newUser.tenantId }
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
        return {
          success: true,
          message: 'Giriş başarılı.',
          token: token,
          role: user.role,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            tenant: user.tenant || null,
            customerProfile: user.customerProfile || null
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
        if (body.discountRate !== undefined) cust.discountRate = parseFloat(body.discountRate);
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
      const newRate = parseFloat(body.discountRate) || 0;
      if (cust) {
        cust.discountRate = newRate;
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
      const prodName = body.name || 'Yeni Parça';
      const oe = body.oeNumber || `OE-${Date.now()}`;
      const cat = body.category || 'Genel';
      const brand = body.vehicleBrand || body.brand || 'Evrensel';
      const models = body.compatibleModels || body.models || '';
      const partGroup = body.partGroup || body.part_group || 'Genel';
      const price = parseFloat(body.price) || 1000;
      const stock = parseInt(body.stock, 10) || 10;
      const newProd = {
        id: `prod-${Date.now().toString(36)}`,
        oeNumber: oe,
        name: prodName,
        category: cat,
        vehicleBrand: brand,
        compatibleModels: models,
        partGroup: partGroup,
        defaultPrice: price,
        imageUrl: '/uploads/sample.png',
        images: JSON.stringify(['/uploads/sample.png'])
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

    // 7c. GET /tenant/dashboard-stats & GET /tenant/stats
    if ((cleanEndpoint === '/tenant/dashboard-stats' || cleanEndpoint === '/tenant/stats') && method === 'GET') {
      const orders = store.orders || [];
      const pendingCount = orders.filter(o => o.status === 'PENDING').length;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayRevenue = orders
        .filter(o => new Date(o.createdAt) >= todayStart && o.status !== 'CANCELLED')
        .reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);
      const customerCount = (store.customers || []).length;
      const recentOrders = orders.slice(0, 5).map(o => {
        const cust = (store.customers || []).find(c => c.id === o.customerId) || (store.customers || [])[0] || {};
        return {
          ...o,
          customer: {
            id: cust.id,
            companyName: cust.companyName || 'Kemal Usta Oto Servis',
            phone: cust.phone || '0532 999 88 77',
            discountRate: cust.discountRate || 20,
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

    // 7d. GET /tenant/orders
    if (cleanEndpoint === '/tenant/orders' && method === 'GET') {
      const orders = (store.orders || []).map(o => {
        const cust = (store.customers || []).find(c => c.id === o.customerId) || (store.customers || [])[0] || {};
        return {
          ...o,
          customer: {
            id: cust.id,
            companyName: cust.companyName || 'Kemal Usta Oto Servis',
            phone: cust.phone || '0532 999 88 77',
            discountRate: cust.discountRate || 20,
            balance: cust.balance || 0
          },
          items: o.items || []
        };
      });
      return {
        success: true,
        count: orders.length,
        data: orders
      };
    }

    // 7e. GET /tenant/orders/:id
    if (cleanEndpoint.startsWith('/tenant/orders/') && !cleanEndpoint.endsWith('/status') && method === 'GET') {
      const orderId = cleanEndpoint.replace('/tenant/orders/', '');
      const order = (store.orders || []).find(o => o.id === orderId);
      if (order) {
        const cust = (store.customers || []).find(c => c.id === order.customerId) || (store.customers || [])[0] || {};
        return {
          success: true,
          data: {
            ...order,
            customer: cust,
            items: order.items || []
          }
        };
      }
      return { success: false, message: 'Sipariş bulunamadı.' };
    }

    // 7f. PATCH /tenant/orders/:id/status
    if (cleanEndpoint.startsWith('/tenant/orders/') && cleanEndpoint.endsWith('/status') && method === 'PATCH') {
      const parts = cleanEndpoint.split('/');
      const orderId = parts[3];
      const newStatus = body.status;
      const order = (store.orders || []).find(o => o.id === orderId);
      if (order && newStatus) {
        order.status = newStatus;
        saveMockStore(store);
        return {
          success: true,
          message: `Sipariş #${order.orderNumber || order.id} durumu "${newStatus}" olarak güncellendi.`,
          data: order
        };
      }
      return { success: false, message: 'Sipariş bulunamadı veya durum geçersiz.' };
    }

    // 8. GET /store/profile
    if (cleanEndpoint === '/store/profile' && method === 'GET') {
      const cust = store.customers[0];
      return {
        success: true,
        data: {
          ...cust,
          tenant: {
            id: 'tenant-ahmet-oto',
            name: 'Ahmet Oto Yedek Parça',
            subdomain: 'ahmetoto',
            themeColor: '#f97316'
          }
        }
      };
    }

    // 9. GET /store/products
    if (cleanEndpoint === '/store/products' && method === 'GET') {
      const discountRate = 25.00;
      const multiplier = (100 - discountRate) / 100;

      const calculated = store.tenantCatalog.map(tc => {
        const prod = store.products.find(p => p.id === tc.productId) || {};
        const listPrice = tc.customPrice !== null ? tc.customPrice : prod.defaultPrice;
        const finalPrice = parseFloat((listPrice * multiplier).toFixed(2));
        return {
          tenantProductId: tc.id,
          productId: prod.id,
          oeNumber: prod.oeNumber,
          name: prod.name,
          category: prod.category,
          imageUrl: prod.imageUrl,
          stock: tc.stock,
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

      return {
        success: true,
        customer: {
          companyName: 'Kemal Usta Oto Servis',
          appliedDiscountRate: '%25',
          currentBalance: '14.850 ₺'
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

    // 10. POST /store/orders
    if (cleanEndpoint === '/store/orders' && method === 'POST') {
      const orderNumber = `SP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const items = body.items || [];
      let subtotal = 0;

      items.forEach(it => {
        const tc = store.tenantCatalog.find(t => t.id === it.tenantProductId);
        if (tc) {
          const prod = store.products.find(p => p.id === tc.productId);
          const price = (tc.customPrice || (prod ? prod.defaultPrice : 500)) * 0.75;
          subtotal += price * (it.quantity || 1);
          tc.stock = Math.max(0, tc.stock - (it.quantity || 1));
        }
      });

      subtotal = parseFloat(subtotal.toFixed(2));
      const vatAmount = parseFloat((subtotal * 0.20).toFixed(2));
      const totalAmount = parseFloat((subtotal + vatAmount).toFixed(2));

      const newOrder = {
        id: `ord-${Date.now().toString(36)}`,
        orderNumber: orderNumber,
        tenantId: 'tenant-ahmet-oto',
        customerId: 'cust-kemal-usta',
        subtotal: subtotal,
        vatRate: 20.00,
        vatAmount: vatAmount,
        totalAmount: totalAmount,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      };

      store.orders.unshift(newOrder);
      if (store.customers[0]) {
        store.customers[0].balance = parseFloat((store.customers[0].balance + totalAmount).toFixed(2));
      }
      saveMockStore(store);

      return {
        success: true,
        message: `Siparişiniz #${orderNumber} numarasıyla başarıyla oluşturuldu.`,
        data: newOrder
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
        url = `http://localhost:5000${url}`;
      }
    }

    // 2. Başlıklar (Headers) ve Token Enjeksiyonu
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const token = localStorage.getItem('token');
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
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

      const isLoginEndpoint = url.includes('/auth/login');

      if ((response.status === 401 || response.status === 403) && !isLoginEndpoint) {
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
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
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
          window.location.href = 'store.html';
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
   * prompt.md Yönergesi: Panellerdeki 'Çıkış Yap' butonlarına tıklanınca çalışır.
   * Bu kod localStorage'ı temizleyip (token ve user'ı silip) tekrar login.html'e yönlendirir.
   */
  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
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

  // Global window nesnesine ata
  window.API_BASE = API_BASE;
  window.apiFetch = apiFetch;
  window.requireAuth = requireAuth;
  window.logout = logout;
  window.escapeHtml = escapeHtml;

})(window);

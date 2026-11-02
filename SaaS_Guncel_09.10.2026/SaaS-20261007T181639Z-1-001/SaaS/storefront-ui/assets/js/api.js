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

  // Headless Mimari Sabit Bayi Kimliği (prompt.md):
  const TENANT_SLUG = 'ahmetoto';
  const SAFE_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

  // Sunucu Adresi Yapılandırması (Headless Mimari prompt.md - Netlify engeli için KESİN VE SABİT):
  const API_BASE = 'https://saas-g-ncel-10-10-2026simdi-main.onrender.com/api';
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
  
  // =========================================================================
  // Birlikte Alınanlar (Cross-Sell / Bakım Kiti) ve Tahmini İşçilik Süresi Motoru (Prompt.md Modül 2 & 3)
  // =========================================================================
  function getRecommendedTogetherAndLabor(name, group, oeCode) {
    const combined = `${name || ''} ${group || ''} ${oeCode || ''}`.toLowerCase();

    // 1. Triger / Sente / Zamanlama Mekanizması
    if (combined.includes('triger') || combined.includes('sente') || combined.includes('zamanlama') || combined.includes('130c15339r') || combined.includes('1872496')) {
      return {
        estimatedLaborTime: '2.5 Saat',
        recommendedTogether: [
          {
            id: 'rec-wp',
            tenantProductId: 'rec-wp',
            name: 'Devirdaim Su Pompası (Metal Yüksek Debi Çark)',
            oeNumber: '210100495R',
            brand: 'VALEO',
            defaultPrice: 1500,
            unitPrice: 1200,
            discountedPrice: 1200,
            laborTime: '+0.5 Saat',
            reason: 'Triger değişirken devirdaim sökülür; işçilik tasarrufu için birlikte değişmelidir.'
          },
          {
            id: 'rec-vbelt',
            tenantProductId: 'rec-vbelt',
            name: 'V Kayışı (Alternatör Kayışı 6PK1200)',
            oeNumber: '7701477028',
            brand: 'GATES',
            defaultPrice: 400,
            unitPrice: 320,
            discountedPrice: 320,
            laborTime: '+0.2 Saat',
            reason: 'Triger seti söküldüğünde V kayışı da doğrudan serbest kalır.'
          },
          {
            id: 'rec-antifreeze',
            tenantProductId: 'rec-antifreeze',
            name: 'Organik Kırmızı Antifriz Konsantre -37°C (3 Litre)',
            oeNumber: 'AFS-ANT-03',
            brand: 'CASTROL',
            defaultPrice: 350,
            unitPrice: 280,
            discountedPrice: 280,
            laborTime: '+0.1 Saat',
            reason: 'Devirdaim su pompası yenilendiğinde soğutma suyu tamamen tazelenmelidir.'
          }
        ]
      };
    }

    // 2. Fren Balatası / Disk / Kaliper
    if (combined.includes('fren') || combined.includes('balata') || combined.includes('disk') || combined.includes('410601241r') || combined.includes('5q0698151b') || combined.includes('77366536')) {
      return {
        estimatedLaborTime: '1 Saat',
        recommendedTogether: [
          {
            id: 'rec-disc',
            tenantProductId: 'rec-disc',
            name: 'Ön Fren Diski Havalandırmalı (280mm Takım)',
            oeNumber: '402060010R',
            brand: 'TRW',
            defaultPrice: 1800,
            unitPrice: 1440,
            discountedPrice: 1440,
            laborTime: '+0.4 Saat',
            reason: 'Aşınmış diske yeni balata takıldığında ötme ve erken aşınma yaşanır.'
          },
          {
            id: 'rec-dot4',
            tenantProductId: 'rec-dot4',
            name: 'DOT-4 Sentetik Fren Hidrolik Sıvısı 500ml',
            oeNumber: 'AFS-DOT4-500',
            brand: 'BREMBO',
            defaultPrice: 200,
            unitPrice: 160,
            discountedPrice: 160,
            laborTime: '+0.2 Saat',
            reason: 'Kaliper pistonları geriye itildiğinde hidrolik basınç ve seviye yenilenmelidir.'
          },
          {
            id: 'rec-spray',
            tenantProductId: 'rec-spray',
            name: 'Balata & Fren Parça Temizleme Spreyi 500ml',
            oeNumber: 'AFS-SPR-500',
            brand: 'WÜRTH',
            defaultPrice: 120,
            unitPrice: 95,
            discountedPrice: 95,
            laborTime: '+0.1 Saat',
            reason: 'Kumpas yuvalarındaki balata tozları ve pası temizlemek için kullanılır.'
          }
        ]
      };
    }

    // 3. Yağ & Filtre Bakım Seti
    if (combined.includes('filtre') || combined.includes('yağ') || combined.includes('yag') || combined.includes('8200768913') || combined.includes('03n115562')) {
      return {
        estimatedLaborTime: '45 Dk',
        recommendedTogether: [
          {
            id: 'rec-air',
            tenantProductId: 'rec-air',
            name: 'Hava Filtresi Paneli',
            oeNumber: '165467674R',
            brand: 'MANN-FILTER',
            defaultPrice: 280,
            unitPrice: 220,
            discountedPrice: 220,
            laborTime: '+15 Dk',
            reason: 'Periyodik bakımda motor ömrü için hava filtresi yağla birlikte değişmelidir.'
          },
          {
            id: 'rec-cabin',
            tenantProductId: 'rec-cabin',
            name: 'Karbonlu Polen Kabin Filtresi',
            oeNumber: '272778970R',
            brand: 'FILTRON',
            defaultPrice: 320,
            unitPrice: 250,
            discountedPrice: 250,
            laborTime: '+15 Dk',
            reason: 'Klima havasının temizliği ve koku önleme için periyodik değişimi önerilir.'
          },
          {
            id: 'rec-oil',
            tenantProductId: 'rec-oil',
            name: '5W-30 C3 Tam Sentetik Motor Yağı (5 Litre)',
            oeNumber: 'AFS-OIL-5W30',
            brand: 'ELF EVOLUTION',
            defaultPrice: 1250,
            unitPrice: 990,
            discountedPrice: 990,
            laborTime: '+20 Dk',
            reason: 'DPF uyumlu tam sentetik motor yağı dolumu.'
          }
        ]
      };
    }

    // 4. Amortisör & Süspansiyon
    if (combined.includes('amortisör') || combined.includes('amortisor') || combined.includes('yay') || combined.includes('salıncak') || combined.includes('543028126r')) {
      return {
        estimatedLaborTime: '2 Saat',
        recommendedTogether: [
          {
            id: 'rec-mount',
            tenantProductId: 'rec-mount',
            name: 'Ön Amortisör Üst Takozu & Bilyası',
            oeNumber: '543A08126R',
            brand: 'SNR',
            defaultPrice: 520,
            unitPrice: 410,
            discountedPrice: 410,
            laborTime: '+0.5 Saat',
            reason: 'Amortisör sökülmüşken takoz ve bilyanın değişmesi direksiyon sertliğini önler.'
          },
          {
            id: 'rec-zrot',
            tenantProductId: 'rec-zrot',
            name: 'Ön Viraj Askı Rotu (Z-Rot Sol/Sağ)',
            oeNumber: '546182198R',
            brand: 'TRW',
            defaultPrice: 300,
            unitPrice: 240,
            discountedPrice: 240,
            laborTime: '+0.2 Saat',
            reason: 'Süspansiyon yenilemede rot başları ve Z-rotlar birlikte kontrol edilmelidir.'
          }
        ]
      };
    }

    // 5. Devirdaim / Soğutma
    if (combined.includes('devirdaim') || combined.includes('termostat') || combined.includes('radyatör') || combined.includes('radyator')) {
      return {
        estimatedLaborTime: '1.5 Saat',
        recommendedTogether: [
          {
            id: 'rec-antifreeze-c',
            tenantProductId: 'rec-antifreeze-c',
            name: 'Organik Kırmızı Antifriz Konsantre -37°C (3 Litre)',
            oeNumber: 'AFS-ANT-03',
            brand: 'CASTROL',
            defaultPrice: 350,
            unitPrice: 280,
            discountedPrice: 280,
            laborTime: '+0.1 Saat',
            reason: 'Soğutma sistemi açıldığında antifrizli su yenilenmelidir.'
          }
        ]
      };
    }

    // Varsayılan
    return {
      estimatedLaborTime: '1 Saat',
      recommendedTogether: []
    };
  }

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

    // 0. POST /auth/register ve /store/auth/register (Multi-tenant Müşteri/Otoservis Kaydı)
    if ((cleanEndpoint === '/auth/register' || cleanEndpoint === '/store/auth/register') && method === 'POST') {
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

      // prompt.md Kuralı: İsteğin header'ından gelen x-tenant-slug bilgisine bakarak doğrudan o bayinin altına bağla
      let headerSlug = null;
      if (options && options.headers) {
        if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
          headerSlug = options.headers.get('x-tenant-slug') || options.headers.get('X-Tenant-Slug');
        } else if (typeof options.headers === 'object') {
          headerSlug = options.headers['x-tenant-slug'] || options.headers['X-Tenant-Slug'];
        }
      }
      const subToFind = headerSlug || body.subdomain || body.tenantSlug || TENANT_SLUG || 'ahmetoto';
      const cleanSub = String(subToFind).trim().toLowerCase();
      const matchedTenant = (store.tenants && store.tenants.find(t => (t.subdomain || '').toLowerCase() === cleanSub || t.id === cleanSub)) 
        || (store.tenants && store.tenants[0]) 
        || { id: 'tenant-ahmet-oto', subdomain: 'ahmetoto', name: 'Ahmet Oto' };
      const tenantId = body.tenantId || matchedTenant.id;

      const customerType = (body.customerType || 'MECHANIC').toUpperCase();
      const fullName = (body.fullName || body.name || email.split('@')[0]).trim();
      const companyName = (body.companyName || '').trim() || (customerType === 'MECHANIC' ? `${fullName} Oto Servis` : fullName);

      if (!email || !password) {
        return { success: false, message: 'E-posta ve şifre zorunludur.' };
      }

      if (password.length < 6) {
        return { success: false, message: 'Şifre en az 6 karakter olmalıdır.' };
      }

      const existingUser = store.users.find(u => u.email.toLowerCase() === email);
      if (existingUser) {
        return { success: false, message: 'Bu e-posta adresi ile kayıtlı kullanıcı zaten mevcut.' };
      }

      // Şifre güvenliği: bcrypt formatında güvenli hashleme simülasyonu
      const bcryptHashedPassword = `$2b$10$eXampleHashMock${btoa(password).slice(0, 22)}`;

      const newProfile = {
        id: `cust-${Date.now().toString(36)}`,
        companyName: companyName,
        phone: (body.phone || '').trim(),
        customerType: customerType,
        taxNumber: (body.taxNumber || '').trim(),
        discountRate: 0.0,
        balance: 0.0,
        status: customerType === 'MECHANIC' ? 'PENDING_APPROVAL' : 'APPROVED',
        tenantId: tenantId,
        tenant: matchedTenant
      };

      const newUser = {
        id: `usr-${Date.now().toString(36)}`,
        email,
        password: bcryptHashedPassword,
        name: fullName,
        role,
        tenantId,
        tenant: matchedTenant,
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
        currentUser = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user'));
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
      try { storedUser = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user')); } catch (e) {}
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
      let categoryFilter = '';
      let subCatFilter = '';
      let mfrFilter = '';
      let inStockFilter = false;
      let minPriceFilter = 0;
      let maxPriceFilter = 0;
      try {
        const parsedUrl = new URL(endpoint, 'https://saas-g-ncel-10-10-2026simdi-main.onrender.com');
        brandFilter = (parsedUrl.searchParams.get('brand') || '').trim().toLowerCase();
        searchFilter = (parsedUrl.searchParams.get('search') || '').trim().toLowerCase();
        categoryFilter = (parsedUrl.searchParams.get('category') || '').trim().toLowerCase();
        subCatFilter = (parsedUrl.searchParams.get('subCategory') || '').trim().toLowerCase();
        mfrFilter = (parsedUrl.searchParams.get('manufacturer') || '').trim().toLowerCase();
        inStockFilter = parsedUrl.searchParams.get('inStock') === 'true';
        minPriceFilter = parseFloat(parsedUrl.searchParams.get('minPrice') || '0') || 0;
        maxPriceFilter = parseFloat(parsedUrl.searchParams.get('maxPrice') || '0') || 0;
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
          estimatedLaborTime: prod.estimatedLaborTime || getRecommendedTogetherAndLabor(prod.name, prod.category, prod.oeNumber).estimatedLaborTime,
          recommendedTogether: (Array.isArray(prod.recommendedTogether) && prod.recommendedTogether.length > 0)
            ? prod.recommendedTogether
            : getRecommendedTogetherAndLabor(prod.name, prod.category, prod.oeNumber).recommendedTogether,
          pricing: {
            listPrice: listPrice,
            discountRate: discountRate,
            savedAmount: parseFloat((listPrice - finalPrice).toFixed(2)),
            finalPrice: finalPrice
          }
        };
      });

      
      // Otomotiv Seed Kataloğu (Yerel Demo & Çevrimdışı Güvencesi)
      if (calculated.length === 0) {
        const defaultSeeds = [
          // ============================================================
          // VOLKSWAGEN GOLF VII FREN SİSTEMİ & PARÇAPRO KATALOĞU
          // ============================================================
          {
            name: 'Volkswagen Golf VII Ön Fren Balatası (Sensörlü)',
            oeNumber: '5Q0698151B',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Ön Fren Balatası',
            manufacturer: 'Bosch',
            compatibleModels: 'Volkswagen Golf VII (1.6 TDI, 1.4 TSI), Passat B8, Octavia III',
            defaultPrice: 1450,
            stock: 14,
            imageUrl: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '45 Dk'
          },
          {
            name: 'Volkswagen Golf VII Ön Fren Balata Takımı (Orijinal VAG)',
            oeNumber: '5Q0698151AA',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Ön Fren Balatası',
            manufacturer: 'Orijinal VAG (OEM)',
            compatibleModels: 'Volkswagen Golf VII 2016-2020, Seat Leon 5F, Audi A3 8V',
            defaultPrice: 2150,
            stock: 24,
            imageUrl: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '45 Dk'
          },
          {
            name: 'Volkswagen Golf VII Ön Fren Balatası (Yüksek Performans)',
            oeNumber: '5Q0698151',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Ön Fren Balatası',
            manufacturer: 'Ferodo',
            compatibleModels: 'Volkswagen Golf VII 1.6 TDI 115 HP, 2.0 TDI',
            defaultPrice: 1320,
            stock: 19,
            imageUrl: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '45 Dk'
          },
          {
            name: 'Volkswagen Golf VII Arka Fren Balatası (Elektrikli Park Freni)',
            oeNumber: '5Q0698451',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Arka Fren Balatası',
            manufacturer: 'TRW / ZF',
            compatibleModels: 'Volkswagen Golf VII Tüm Modeller, Passat B8, Tiguan',
            defaultPrice: 1150,
            stock: 12,
            imageUrl: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '40 Dk'
          },
          {
            name: 'Volkswagen Golf VII Arka Fren Balata Takımı (Sessiz Tip)',
            oeNumber: '8V0698451',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Arka Fren Balatası',
            manufacturer: 'Textar',
            compatibleModels: 'Volkswagen Golf VII, Audi A3 8V, Skoda Octavia III',
            defaultPrice: 1080,
            stock: 22,
            imageUrl: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '40 Dk'
          },
          {
            name: 'Volkswagen Golf VII Ön Fren Diski 288x25mm Havalandırmalı (Takım)',
            oeNumber: '5Q0615301H',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Ön Fren Diski',
            manufacturer: 'Brembo',
            compatibleModels: 'Volkswagen Golf VII 1.6 TDI (PR-1ZA, 1ZE), Passat B8',
            defaultPrice: 2850,
            stock: 18,
            imageUrl: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '1 Saat'
          },
          {
            name: 'Volkswagen Golf VII Ön Fren Diski 276mm (Hava Soğutmalı Takım)',
            oeNumber: '5Q0615301G',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Ön Fren Diski',
            manufacturer: 'Bosch',
            compatibleModels: 'Volkswagen Golf VII 1.2 TSI, 1.6 TDI (PR-1ZF)',
            defaultPrice: 2450,
            stock: 15,
            imageUrl: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '1 Saat'
          },
          {
            name: 'Volkswagen Golf VII Arka Fren Diski 272x10mm Dolu Tip (Takım)',
            oeNumber: '5Q0615601F',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Arka Fren Diski',
            manufacturer: 'TRW / ZF',
            compatibleModels: 'Volkswagen Golf VII, Skoda Octavia III, Seat Leon 5F',
            defaultPrice: 1950,
            stock: 16,
            imageUrl: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '50 Dk'
          },
          {
            name: 'Volkswagen Golf VII Fren Kaliperi Ön Sol (Komple Döküm)',
            oeNumber: '5Q0615123',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Fren Kaliperi & Hortumlar',
            manufacturer: 'TRW / ZF',
            compatibleModels: 'Volkswagen Golf VII 2016-2020 Platformu',
            defaultPrice: 3450,
            stock: 8,
            imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '1.5 Saat'
          },
          {
            name: 'Volkswagen Golf VII Çelik Örgülü Fren Hortumu Ön Takım',
            oeNumber: '5Q0611701C',
            vehicleBrand: 'Volkswagen',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Fren Kaliperi & Hortumlar',
            manufacturer: 'Valeo',
            compatibleModels: 'Volkswagen Golf VII 1.6 TDI, GTD, R-Line',
            defaultPrice: 680,
            stock: 14,
            imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '30 Dk'
          },
          {
            name: 'Volkswagen Golf VII Yağ & Yakıt Filtre Bakım Kiti',
            oeNumber: '03N115562',
            vehicleBrand: 'Volkswagen',
            category: 'Filtreler',
            partGroup: 'Filtre & Bakım',
            subCategory: 'Filtre & Bakım',
            manufacturer: 'Bosch',
            compatibleModels: 'Volkswagen Golf VII 1.6 TDI, Passat B8',
            defaultPrice: 850,
            stock: 35,
            imageUrl: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '45 Dk'
          },
          {
            name: 'Volkswagen Golf VII Triger Kayış Seti & Devirdaim Pompası',
            oeNumber: '04L198119A',
            vehicleBrand: 'Volkswagen',
            category: 'Motor Parçaları',
            partGroup: 'Motor & Şanzıman',
            subCategory: 'Motor & Şanzıman',
            manufacturer: 'Bosch',
            compatibleModels: 'Volkswagen Golf VII 1.6 TDI (115 HP) 2016-2020',
            defaultPrice: 4200,
            stock: 12,
            imageUrl: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '2.5 Saat'
          },

          // ============================================================
          // DİĞER MODELLER (RENAULT, FIAT, FORD, BMW)
          // ============================================================
          {
            name: 'Renault Megane IV Triger Kayış Kiti & Gergi Rulmanı',
            oeNumber: '130C15339R',
            vehicleBrand: 'Renault',
            category: 'Motor Parçaları',
            partGroup: 'Motor & Şanzıman',
            subCategory: 'Motor & Şanzıman',
            manufacturer: 'Orijinal VAG (OEM)',
            compatibleModels: 'Megane IV, Clio V, Captur II 1.5 dCi',
            defaultPrice: 2850,
            stock: 20,
            imageUrl: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '2.5 Saat'
          },
          {
            name: 'Renault Megane IV Ön Fren Balata Takımı (Sensörlü)',
            oeNumber: '410601241R',
            vehicleBrand: 'Renault',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Ön Fren Balatası',
            manufacturer: 'Ferodo',
            compatibleModels: 'Megane IV, Clio V, Talisman, Kadjar',
            defaultPrice: 1250,
            stock: 18,
            imageUrl: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '45 Dk'
          },
          {
            name: 'Fiat Egea Ön Fren Balata Takımı',
            oeNumber: '77366536',
            vehicleBrand: 'Fiat',
            category: 'Fren Sistemi',
            partGroup: 'Fren Sistemi',
            subCategory: 'Ön Fren Balatası',
            manufacturer: 'Bosch',
            compatibleModels: 'Fiat Egea 1.3 / 1.6 Multijet, 500L',
            defaultPrice: 1100,
            stock: 30,
            imageUrl: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '40 Dk'
          },
          {
            name: 'Ford Focus Triger Kayış & Rulman Seti',
            oeNumber: '1872496',
            vehicleBrand: 'Ford',
            category: 'Motor Parçaları',
            partGroup: 'Motor & Şanzıman',
            subCategory: 'Motor & Şanzıman',
            manufacturer: 'Continental',
            compatibleModels: 'Ford Focus 1.5 TDCi, C-Max, Kuga',
            defaultPrice: 2950,
            stock: 15,
            imageUrl: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400&auto=format&fit=crop&q=80',
            estimatedLaborTime: '2 Saat'
          }
        ];

        calculated = defaultSeeds.map((seed, sIdx) => {
          const listP = seed.defaultPrice;
          const discAmt = discountRate > 0 ? listP * (discountRate / 100) : 0;
          const finP = parseFloat((listP - discAmt).toFixed(2));
          const lr = getRecommendedTogetherAndLabor(seed.name, seed.partGroup, seed.oeNumber);
          return {
            tenantProductId: `tp-seed-${sIdx + 1}`,
            productId: `prod-seed-${sIdx + 1}`,
            oeNumber: seed.oeNumber,
            name: seed.name,
            category: seed.category,
            vehicleBrand: seed.vehicleBrand,
            compatibleModels: seed.compatibleModels,
            partGroup: seed.partGroup,
            imageUrl: seed.imageUrl,
            images: [seed.imageUrl],
            stock: seed.stock || 25,
            subCategory: seed.subCategory || '',
            manufacturer: seed.manufacturer || '',
            estimatedLaborTime: seed.estimatedLaborTime || lr.estimatedLaborTime,
            isDiscounted: discountRate > 0,
            defaultPrice: listP,
            customPrice: listP,
            discountedPrice: finP,
            appliedDiscountRate: discountRate,
            pricing: {
              listPrice: listP,
              discountRate: discountRate,
              savedAmount: parseFloat((listP - finP).toFixed(2)),
              finalPrice: finP
            },
            estimatedLaborTime: lr.estimatedLaborTime,
            recommendedTogether: lr.recommendedTogether
          };
        });
      }

      if (brandFilter && brandFilter !== 'all') {
        calculated = calculated.filter(p => (p.vehicleBrand || '').toLowerCase().includes(brandFilter));
      }

      if (searchFilter) {
        // Akıllı Garaj: Şasi No (VIN) veya Plaka eşleşmesi
        let matchedGarageVehicle = null;
        if (store.garageVehicles && Array.isArray(store.garageVehicles)) {
          const cleanQ = searchFilter.replace(/\s+/g, '').toLowerCase();
          matchedGarageVehicle = store.garageVehicles.find(v => {
            const vVin = (v.vin || '').replace(/\s+/g, '').toLowerCase();
            const vPlate = (v.plateNumber || '').replace(/\s+/g, '').toLowerCase();
            return vVin === cleanQ || cleanQ.includes(vVin) || vPlate === cleanQ;
          });
        }

        if (matchedGarageVehicle) {
          const vBrand = (matchedGarageVehicle.vehicleBrand || '').toLowerCase();
          const vModel = (matchedGarageVehicle.vehicleModel || '').toLowerCase();
          const filtered = calculated.filter(p => {
            const b = (p.vehicleBrand || '').toLowerCase();
            const c = (p.compatibleModels || '').toLowerCase();
            const n = (p.name || '').toLowerCase();
            const brandMatch = vBrand && (b.includes(vBrand) || c.includes(vBrand));
            const modelTokens = vModel.split(/\s+/).filter(t => t.length > 2);
            const modelMatch = modelTokens.some(t => c.includes(t) || n.includes(t));
            return brandMatch || modelMatch;
          });
          calculated = filtered.length > 0 ? filtered : calculated;
        } else {
          // Ham VIN desenleri algılama (VF1 -> Renault, WVW -> VW, ZFA -> Fiat, WF0 -> Ford)
          let detectedBrand = '';
          const rawVin = searchFilter.toLowerCase().replace(/\s+/g, '');
          if (rawVin.startsWith('vf1')) detectedBrand = 'renault';
          else if (rawVin.startsWith('wvw') || rawVin.startsWith('wau')) detectedBrand = 'volkswagen';
          else if (rawVin.startsWith('zfa')) detectedBrand = 'fiat';
          else if (rawVin.startsWith('wf0')) detectedBrand = 'ford';

          calculated = calculated.filter(p => 
            (p.name || '').toLowerCase().includes(searchFilter) ||
            (p.oeNumber || '').toLowerCase().includes(searchFilter) ||
            (p.vehicleBrand || '').toLowerCase().includes(searchFilter) ||
            (p.compatibleModels || '').toLowerCase().includes(searchFilter) ||
            (p.partGroup || '').toLowerCase().includes(searchFilter) ||
            (detectedBrand && (p.vehicleBrand || '').toLowerCase().includes(detectedBrand)) ||
            (detectedBrand && (p.compatibleModels || '').toLowerCase().includes(detectedBrand))
          );
        }
      }

      if (categoryFilter && categoryFilter !== 'all') {
        calculated = calculated.filter(p => 
          (p.category || '').toLowerCase().includes(categoryFilter) ||
          (p.partGroup || '').toLowerCase().includes(categoryFilter)
        );
      }

      if (subCatFilter && subCatFilter !== 'all') {
        calculated = calculated.filter(p => 
          (p.subCategory || '').toLowerCase().includes(subCatFilter) ||
          (p.name || '').toLowerCase().includes(subCatFilter)
        );
      }

      if (mfrFilter && mfrFilter !== 'all') {
        calculated = calculated.filter(p => 
          (p.manufacturer || '').toLowerCase().includes(mfrFilter)
        );
      }

      if (inStockFilter) {
        calculated = calculated.filter(p => (p.stock || 0) > 0);
      }

      if (minPriceFilter > 0) {
        calculated = calculated.filter(p => (p.discountedPrice || p.defaultPrice || 0) >= minPriceFilter);
      }

      if (maxPriceFilter > 0) {
        calculated = calculated.filter(p => (p.discountedPrice || p.defaultPrice || 0) <= maxPriceFilter);
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

    
    // =========================================================================
    // 10d. AKILLI GARAJ (MY GARAGE) YÖNETİMİ (Prompt Modül 1 & 2)
    // =========================================================================

    // GET /garage/vehicles & GET /garage
    if ((cleanEndpoint === '/garage/vehicles' || cleanEndpoint === '/garage') && method === 'GET') {
      if (!store.garageVehicles || store.garageVehicles.length === 0) {
        store.garageVehicles = [
          {
            id: 'grg-1',
            plateNumber: '34 KL 4821',
            customerName: 'Ahmet Usta (Demir Nakliyat)',
            vin: 'VF15R040H52814321',
            vehicleModel: 'Renault Megane IV 1.5 dCi (2020)',
            vehicleBrand: 'Renault',
            createdAt: '2026-10-15T09:30:00.000Z'
          },
          {
            id: 'grg-2',
            plateNumber: '06 BT 992',
            customerName: 'Ali Yılmaz (Öz Ticaret)',
            vin: 'WVWZZZAUZHP129841',
            vehicleModel: 'Volkswagen Golf 7 1.6 TDI (2019)',
            vehicleBrand: 'Volkswagen',
            createdAt: '2026-10-22T14:15:00.000Z'
          },
          {
            id: 'grg-3',
            plateNumber: '35 FZ 104',
            customerName: 'Hasan Kaya (Kaya Lojistik)',
            vin: 'ZFA35600006781290',
            vehicleModel: 'Fiat Egea 1.3 Multijet (2021)',
            vehicleBrand: 'Fiat',
            createdAt: '2026-10-28T11:00:00.000Z'
          },
          {
            id: 'grg-4',
            plateNumber: '16 BUR 77',
            customerName: 'Murat Usta (Bursa Oto Servis)',
            vin: 'WF0DXXGAKDJP18231',
            vehicleModel: 'Ford Focus 1.5 TDCi (2018)',
            vehicleBrand: 'Ford',
            createdAt: '2026-10-29T16:00:00.000Z'
          }
        ];
        saveMockStore(store);
      }
      return {
        success: true,
        count: store.garageVehicles.length,
        data: store.garageVehicles
      };
    }

    // POST /garage/vehicles & POST /garage
    if ((cleanEndpoint === '/garage/vehicles' || cleanEndpoint === '/garage') && method === 'POST') {
      const customerName = String(body.customerName || body.name || '').trim();
      const plateNumber = String(body.plateNumber || body.plate || '').trim().toUpperCase();
      const vin = String(body.vin || body.vinNumber || '').trim().toUpperCase();
      const vehicleModel = String(body.vehicleModel || body.model || body.vehicleInfo || 'Binek Araç').trim();
      const vehicleBrand = String(body.vehicleBrand || body.brand || 'Renault').trim();

      if (!customerName || !plateNumber) {
        return {
          success: false,
          status: 400,
          message: 'Garaja kayıt için "Müşteri Adı" ve "Plaka" alanlarının doldurulması zorunludur.'
        };
      }

      if (!store.garageVehicles) store.garageVehicles = [];

      const newVehicle = {
        id: `grg-${Date.now().toString(36)}`,
        customerName,
        plateNumber,
        vin: vin || 'VF15R040H52814321',
        vehicleModel,
        vehicleBrand,
        createdAt: new Date().toISOString()
      };

      const existingIdx = store.garageVehicles.findIndex(v => v.plateNumber === plateNumber);
      if (existingIdx >= 0) {
        store.garageVehicles[existingIdx] = { ...store.garageVehicles[existingIdx], ...newVehicle, id: store.garageVehicles[existingIdx].id };
      } else {
        store.garageVehicles.unshift(newVehicle);
      }
      saveMockStore(store);

      return {
        success: true,
        message: `"${plateNumber}" plakalı araç (${customerName}) Akıllı Garajınıza başarıyla kaydedildi.`,
        data: newVehicle
      };
    }

    // DELETE /garage/vehicles/:id & DELETE /garage/:id
    if ((cleanEndpoint.startsWith('/garage/vehicles/') || cleanEndpoint.startsWith('/garage/')) && method === 'DELETE') {
      const parts = cleanEndpoint.split('/');
      const targetId = parts[parts.length - 1];
      if (store.garageVehicles) {
        store.garageVehicles = store.garageVehicles.filter(v => v.id !== targetId && v.plateNumber !== targetId);
        saveMockStore(store);
      }
      return {
        success: true,
        message: 'Araç garajınızdan silindi.'
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
    // 1. URL Yapılandırması (Kendi Netlify domainine istek atmasını kesin olarak engelle)
    let url = endpoint;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
      if (cleanEndpoint.startsWith('/api')) {
        url = `https://saas-g-ncel-10-10-2026simdi-main.onrender.com${cleanEndpoint}`;
      } else {
        url = `${API_BASE}${cleanEndpoint}`;
      }
    }

    // 2. Başlıklar (Headers) ve Token Enjeksiyonu
    const headers = new Headers(options.headers || {});
    if (options.body instanceof FormData) {
      headers.delete('Content-Type');
    } else if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || 
                  (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token'));
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // 5. ADIM: Sabit Bayi Kimliği Enjeksiyonu ('x-tenant-slug': 'ahmetoto')
    headers.set('x-tenant-slug', TENANT_SLUG);
    headers.set('X-Tenant-Slug', TENANT_SLUG);

    // 6. ADIM: Katalog / Vitrin API İsteklerinde Query Parametresine Tenant Dahil Etme
    // Backend resolveTenant hem Header hem Query parametresi (?tenant= veya ?subdomain=) destekler.
    if (url.includes('/store/') || url.includes('/products') || url.includes('/catalog/')) {
      if (!url.includes('tenant=')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}tenant=${encodeURIComponent(TENANT_SLUG)}&subdomain=${encodeURIComponent(TENANT_SLUG)}`;
      }
    }

    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      body = JSON.stringify(body);
    }

    // 3. Canlı Sunucuya Bağlantı Denemesi (Render Canlı Express API'sine doğrudan bağlan)
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
        window.location.pathname.endsWith('index.html') ||
        window.location.pathname === '/' ||
        window.location.pathname.endsWith('/store') ||
        !window.location.pathname.includes('admin')
      )) || url.includes('/store/');

      if ((response.status === 401 || response.status === 403) && !isLoginEndpoint) {
        // Müşteri vitrininde (storefront-ui / index.html) asla genel SaaS login.html sayfasına yönlendirme!
        if (isStoreContext) {
          console.warn(`[API] Vitrinde yetkisiz/oturumsuz istek (${response.status}). Ziyaretçi modunda kalınacak.`);
          if (response.status === 401) {
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
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
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        const fallbackLogin = (typeof window !== 'undefined' && window.location && !window.location.pathname.includes('admin'))
          ? (window.location.pathname.endsWith('index.html') ? 'index.html' : '/')
          : 'login.html';
        window.location.href = fallbackLogin;
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
      window.location.pathname.endsWith('index.html') ||
      window.location.pathname === '/' ||
      window.location.pathname.endsWith('/store') ||
      !window.location.pathname.includes('admin')
    );

    const token = sessionStorage.getItem('token');
    const userStr = sessionStorage.getItem('user');

    if (!token || !userStr) {
      if (isStorePage) {
        return null;
      }
      console.warn('[AUTH_GUARD] Token veya kullanıcı bilgisi bulunamadı. Giriş sayfasına yönlendiriliyor.');
      window.location.href = (typeof window !== 'undefined' && window.location && !window.location.pathname.includes('admin'))
        ? (window.location.pathname.endsWith('index.html') ? 'index.html' : '/')
        : 'login.html';
      return null;
    }

    let user;
    try {
      user = JSON.parse(userStr);
    } catch (e) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (isStorePage) {
        return null;
      }
      window.location.href = (typeof window !== 'undefined' && window.location && !window.location.pathname.includes('admin'))
        ? (window.location.pathname.endsWith('index.html') ? 'index.html' : '/')
        : 'login.html';
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
            ? '../storefront-ui/index.html'
            : (window.location.pathname.endsWith('index.html') ? 'index.html' : '/');
          window.location.href = storeUrl;
        } else {
          window.location.href = (window.location.pathname.endsWith('index.html') ? 'index.html' : '/');
        }
        return null;
      }
    }

    return user;
  }

  /**
   * logout:
   * Güvenli Çıkış (Safe Session Invalidation):
   * 1. Token, kullanıcı ve yetki verilerini LocalStorage ve SessionStorage üzerinden tamamen siler.
   * 2. Açık Yönlendirme (Open Redirect) zafiyetlerine karşı dış linkleri kesinlikle engeller.
   * 3. Netlify'da 404 veren olmayan sayfalara (store.html, login.html vb.) yönlendirmeyi önler;
   *    doğrudan ana vitrin sayfasına (/ veya index.html) yönlendirir.
   */
  function logout(redirectTarget = null) {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('jwt');
      localStorage.removeItem('customerProfile');
      sessionStorage.clear();
    } catch (e) {
      console.warn('[LOGOUT_STORAGE_CLEAR_WARN]:', e);
    }

    // Açık Yönlendirme (Open Redirect) güvenlik kontrolü:
    // Dış alan adlarına (http, https, //) ve tehlikeli şemalara (javascript:) izin verilmez.
    let safeRedirect = null;
    if (redirectTarget && typeof redirectTarget === 'string') {
      const trimmed = redirectTarget.trim();
      const isUnsafe = (
        trimmed.startsWith('//') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('javascript:') ||
        trimmed.includes('login.html') ||
        trimmed.includes('store.html')
      );
      if (!isUnsafe && (trimmed === '/' || trimmed === 'index.html' || trimmed.endsWith('index.html'))) {
        safeRedirect = trimmed;
      }
    }

    if (safeRedirect) {
      window.location.href = safeRedirect;
      return;
    }

    const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
    const targetPage = isFileProtocol ? 'index.html' : (window.location.pathname.endsWith('index.html') ? 'index.html' : '/');
    window.location.href = targetPage;
  }

  // ==========================================================================
  // GLOBAL İNAKTİVİTE VE OTOMATİK ZAMAN AŞIMI SİSTEMİ (30 DAKİKA)
  // ==========================================================================
  const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 Dakika (1.800.000 ms)
  const INACTIVITY_STORAGE_KEY = 'session_last_activity';
  let lastActivityThrottled = 0;
  let isSessionTimeoutTriggered = false;

  function recordUserActivity() {
    const now = Date.now();
    if (now - lastActivityThrottled < 5000) return;
    lastActivityThrottled = now;

    const token = sessionStorage.getItem('token');
    if (token) {
      try {
        sessionStorage.setItem(INACTIVITY_STORAGE_KEY, String(now));
      } catch (e) {}
    }
  }

  function checkInactivityTimeout() {
    const token = sessionStorage.getItem('token');
    if (!token) return;

    const lastActiveStr = sessionStorage.getItem(INACTIVITY_STORAGE_KEY);
    const lastActive = parseInt(lastActiveStr, 10);
    const now = Date.now();

    if (!lastActive || isNaN(lastActive)) {
      try { sessionStorage.setItem(INACTIVITY_STORAGE_KEY, String(now)); } catch (e) {}
      return;
    }

    if (now - lastActive >= INACTIVITY_TIMEOUT_MS) {
      triggerInactivityLogout();
    }
  }

  function triggerInactivityLogout() {
    if (isSessionTimeoutTriggered) return;
    isSessionTimeoutTriggered = true;

    try {
      sessionStorage.clear();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('jwt');
      localStorage.removeItem('customerProfile');
    } catch (e) {}

    const msg = 'Güvenlik nedeniyle oturumunuz zaman aşımına uğradı';
    if (typeof window !== 'undefined' && window.Swal) {
      window.Swal.fire({
        icon: 'warning',
        title: 'Oturum Zaman Aşımı',
        text: msg,
        confirmButtonText: 'Tamam',
        confirmButtonColor: 'var(--tenant-color, #f97316)'
      }).then(() => {
        logout();
      });
    } else {
      alert(msg);
      logout();
    }
  }

  function initInactivityWatcher() {
    if (typeof window === 'undefined') return;

    // Güvenlik Standardı: Kalıcı localStorage token sızıntılarını imha et
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('jwt');
      localStorage.removeItem('customerProfile');
    } catch (e) {}

    const token = sessionStorage.getItem('token');
    if (token) {
      const lastActive = parseInt(sessionStorage.getItem(INACTIVITY_STORAGE_KEY), 10);
      if (lastActive && (Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS)) {
        triggerInactivityLogout();
        return;
      }
      recordUserActivity();
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach(evt => {
      window.addEventListener(evt, recordUserActivity, { passive: true });
    });

    setInterval(checkInactivityTimeout, 10000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          checkInactivityTimeout();
        }
      });
    }
  }

  // Sistemdeki tüm panellerdeki (admin.html, bayi.html vb.) 'Çıkış Yap' butonlarına otomatik bağlanma ve sayaç başlatma
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      initInactivityWatcher();
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

  /**
   * getResolvedTenantSlug:
   * Headless mimaride otomatik host/subdomain algılama iptal edilmiştir.
   * Sabit ve güvenli olarak TENANT_SLUG ('ahmetoto') döndürür.
   */
  function getResolvedTenantSlug() {
    return TENANT_SLUG;
  }

  // Global window nesnesine ata
  window.TENANT_SLUG = TENANT_SLUG;
  window.API_BASE = API_BASE;
  window.apiFetch = apiFetch;
  window.requireAuth = requireAuth;
  window.logout = logout;
  window.escapeHtml = escapeHtml;
  window.parseJwtPayload = parseJwtPayload;
  window.jwtDecode = window.jwtDecode || parseJwtPayload;
  window.getResolvedTenantSlug = getResolvedTenantSlug;
  window.getRecommendedTogetherAndLabor = getRecommendedTogetherAndLabor;
  window.initInactivityWatcher = initInactivityWatcher;

})(window);

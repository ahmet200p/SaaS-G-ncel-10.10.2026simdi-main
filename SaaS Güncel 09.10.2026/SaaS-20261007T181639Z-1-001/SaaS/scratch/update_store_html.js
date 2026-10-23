const fs = require('fs');
const path = require('path');

const storeHtmlPath = path.join(__dirname, '../storefront-ui/store.html');
let content = fs.readFileSync(storeHtmlPath, 'utf8');

// 1. Add getStoreSubdomain helper at the beginning of the script section
const helperDef = `    // ==========================================================================
    // 0. DİNAMİK MULTI-TENANT SUBDOMAIN ÇÖZÜMLEME YARDIMCISI (HEADLESS STOREFRONT)
    // ==========================================================================
    function getStoreSubdomain() {
      if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        const qSlug = urlParams.get('subdomain') || urlParams.get('tenant') || urlParams.get('slug');
        if (qSlug && qSlug.trim()) {
          const clean = qSlug.trim().toLowerCase();
          try { localStorage.setItem('tenantSlug', clean); } catch (e) {}
          return clean;
        }
        if (window.location.hostname) {
          const parts = window.location.hostname.split('.');
          if (parts.length === 2 && parts[1] === 'localhost' && parts[0] !== 'localhost') {
            const devSub = parts[0].toLowerCase();
            try { localStorage.setItem('tenantSlug', devSub); } catch (e) {}
            return devSub;
          }
          if (parts.length >= 3 && !['www', 'api', 'admin', 'panel'].includes(parts[0])) {
            const prodSub = parts[0].toLowerCase();
            try { localStorage.setItem('tenantSlug', prodSub); } catch (e) {}
            return prodSub;
          }
        }
      }
      let localSlug = null;
      try { localSlug = localStorage.getItem('tenantSlug'); } catch (e) {}
      return localSlug || 'ahmetoto';
    }
    window.getStoreSubdomain = getStoreSubdomain;
`;

if (!content.includes('function getStoreSubdomain(')) {
  content = content.replace(
    '// ==========================================================================\n    // 1. UYGULAMA BAŞLATMA (INIT) VE OLAY DİNLEYİCİLERİ',
    helperDef + '\n    // ==========================================================================\n    // 1. UYGULAMA BAŞLATMA (INIT) VE OLAY DİNLEYİCİLERİ'
  );
}

// 2. Replace loadProfile to ensure it always calls /store/tenant-info with dynamic slug and never silently falls back to Ahmet Oto
const oldLoadProfileRegex = /async function loadProfile\(\) \{[\s\S]*?async function refreshCariLedgerData\(\)/;

const newLoadProfile = `async function loadProfile() {
      try {
        const dealerNameEl = document.getElementById('dealer-name-text');
        const dealerLogoImg = document.getElementById('dealer-logo-img');
        const dealerDefaultEmblem = document.getElementById('dealer-default-emblem');
        const footerDealerEl = document.getElementById('footer-dealer-name');

        const activeSlug = getStoreSubdomain();

        // 1. Her durumda aktif URL'deki bayinin marka, logo ve tema bilgilerini çek
        try {
          const tenantRes = await apiFetch('/store/tenant-info');
          if (tenantRes && tenantRes.success && tenantRes.data) {
            const t = tenantRes.data;
            currentTenant = t;
            const formatted = formatDealerName(t.name);
            if (dealerNameEl) dealerNameEl.textContent = formatted;
            document.title = \`\${formatted} | B2B Parça Vitrini\`;
            if (footerDealerEl) footerDealerEl.textContent = formatted;

            if (t.logoUrl) {
              if (dealerLogoImg) {
                dealerLogoImg.src = t.logoUrl;
                dealerLogoImg.style.display = 'block';
              }
              if (dealerDefaultEmblem) dealerDefaultEmblem.style.display = 'none';
            }
            if (t.themeColor) {
              document.documentElement.style.setProperty('--tenant-primary', t.themeColor);
            }
          } else if (tenantRes && tenantRes.code === 'TENANT_NOT_FOUND') {
            if (dealerNameEl) dealerNameEl.textContent = \`\${activeSlug} (Mağaza Bulunamadı)\`;
            document.title = 'Mağaza Bulunamadı | B2B Parça Vitrini';
            if (footerDealerEl) footerDealerEl.textContent = \`\${activeSlug} (Bulunamadı)\`;
          } else if (tenantRes && tenantRes.code === 'TENANT_PENDING_APPROVAL') {
            if (dealerNameEl) dealerNameEl.textContent = \`\${activeSlug} (Onay Bekliyor)\`;
            document.title = 'Onay Bekliyor | B2B Parça Vitrini';
            if (footerDealerEl) footerDealerEl.textContent = \`\${activeSlug} (Onay Bekliyor)\`;
          }
        } catch (tErr) {
          console.warn('[TENANT_INFO_LOAD_WARN]:', tErr);
        }

        if (!isLoggedIn()) {
          return;
        }

        const res = await apiFetch('/store/profile');
        if (res && res.success && res.data) {
          const profile = res.data;
          currentCustomer = profile;

          // Sağ: Kullanıcı Adı (Kemal Usta vb.)
          const userNameEl = document.getElementById('user-display-name');
          const userAvatarEl = document.getElementById('user-avatar-initials');
          const dropdownNameEl = document.getElementById('dropdown-user-name');
          const dropdownRoleEl = document.getElementById('dropdown-user-role');
          const dropdownEmailEl = document.getElementById('dropdown-user-email');
          const dropdownAvatarEl = document.getElementById('dropdown-avatar-circle');

          const companyName = profile.companyName || profile.name || 'Kemal Usta';
          if (userNameEl) userNameEl.textContent = companyName;
          if (dropdownNameEl) dropdownNameEl.textContent = companyName;
          if (dropdownEmailEl && (profile.email || (profile.user && profile.user.email))) {
            dropdownEmailEl.textContent = profile.email || profile.user.email;
          }

          const isRetail = profile.customerType === 'RETAIL' || profile.isB2B === false;
          const userRoleEl = document.getElementById('user-role-label');
          const roleText = isRetail
            ? 'Bireysel Müşteri'
            : (profile.user && profile.user.role === 'SUPER_ADMIN' ? 'Süper Admin' : (profile.user && profile.user.role === 'TENANT_ADMIN' ? 'Bayi Yöneticisi' : 'Otoservis Müşterisi'));
          if (userRoleEl) userRoleEl.textContent = roleText;
          if (dropdownRoleEl) dropdownRoleEl.textContent = roleText;

          // Rol Tabanlı Cari Hesap Denetimi
          const btnDropdownCari = document.getElementById('btn-dropdown-current-account');
          if (btnDropdownCari) {
            btnDropdownCari.style.display = isRetail ? 'none' : 'flex';
          }

          const parts = companyName.trim().split(' ');
          const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : companyName.substring(0, 2).toUpperCase();
          if (userAvatarEl) userAvatarEl.textContent = initials;
          if (dropdownAvatarEl) dropdownAvatarEl.textContent = initials;

          const balanceEl = document.getElementById('user-balance-amount');
          if (balanceEl) {
            const bal = parseFloat(profile.balance || 0);
            balanceEl.textContent = (bal >= 0 ? '+' : '') + bal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
          }
        }
      } catch (err) {
        console.warn('[PROFILE_LOAD_WARN]:', err);
      }
    }

    // --------------------------------------------------------------------------
    // 3. ADIM: CARİ EKSTRE / HESAP DURUMU MODAL İŞLEMLERİ (B2B Cari Hesap & Kredi Limiti)
    // --------------------------------------------------------------------------
    function openCurrentAccountModal() {
      if (!isLoggedIn()) {
        openLoginModal();
        showToast('Cari hesap durumunu görüntülemek için lütfen giriş yapınız.', 'warning');
        return;
      }

      const isRetail = (currentCustomer && (currentCustomer.customerType === 'RETAIL' || currentCustomer.isB2B === false));
      if (isRetail) {
        showToast('Bireysel müşteriler için cari hesap ekstresi bulunmamaktadır.', 'info');
        return;
      }

      const modal = document.getElementById('modal-current-account');
      if (modal) {
        modal.classList.add('active');
        modal.classList.add('open');
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        document.body.style.overflow = 'hidden';
      }

      refreshCariLedgerData();
    }

    function closeCurrentAccountModal() {
      const modal = document.getElementById('modal-current-account');
      if (modal) {
        modal.classList.remove('active');
        modal.classList.remove('open');
        modal.style.display = 'none';
        modal.style.opacity = '0';
        document.body.style.overflow = '';
      }
    }

    async function refreshCariLedgerData()`;

content = content.replace(oldLoadProfileRegex, newLoadProfile);

// 3. Update loadProducts to pass dynamic X-Tenant-Slug and subdomain param and handle error states
const oldLoadProductsRegex = /async function loadProducts\(\) \{[\s\S]*?function renderProductTable\(\)/;

const newLoadProducts = `async function loadProducts() {
      const tbody = document.getElementById('products-table-body');
      const emptyState = document.getElementById('empty-catalog-state');
      const activeSlug = getStoreSubdomain();
      
      tbody.innerHTML = \`
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">
            <div style="display: inline-block; width: 28px; height: 28px; border: 3px solid #cbd5e1; border-top-color: var(--tenant-primary, #2563eb); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <div style="margin-top: 10px; font-weight: 600;">\${escapeHtml(activeSlug)} Parça Kataloğu Yükleniyor...</div>
          </td>
        </tr>
      \`;

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('subdomain', activeSlug);
        queryParams.set('limit', '100');
        if (currentBrand && currentBrand !== 'ALL') {
          queryParams.set('brand', currentBrand);
        }
        if (currentSearchQuery) {
          queryParams.set('search', currentSearchQuery);
          if (currentSearchType && currentSearchType !== 'all') {
            queryParams.set('searchType', currentSearchType);
          }
        }

        const queryString = queryParams.toString();
        let res = null;

        // Headless API uç noktaları (Öncelikli olarak aktif subdomain ile)
        const candidateEndpoints = [
          \`http://localhost:5000/api/store/products?\${queryString}\`,
          \`http://localhost:3000/api/store/products?\${queryString}\`,
          \`http://localhost:5000/api/products?\${queryString}\`,
          \`/api/store/products?\${queryString}\`,
          \`/api/products?\${queryString}\`
        ];

        const token = localStorage.getItem('token');
        const headers = {
          'Accept': 'application/json',
          'X-Tenant-Slug': activeSlug
        };
        if (token) {
          headers['Authorization'] = \`Bearer \${token}\`;
        }

        let fetchedData = null;
        let lastStatus = 200;

        for (const targetUrl of candidateEndpoints) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const response = await fetch(targetUrl, {
              method: 'GET',
              headers: headers,
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            lastStatus = response.status;
            if (response.ok) {
              fetchedData = await response.json();
              if (fetchedData && (fetchedData.success || Array.isArray(fetchedData.data))) {
                break;
              }
            } else if (response.status === 404 || response.status === 403) {
              fetchedData = await response.json().catch(() => null);
              break;
            }
          } catch (netErr) {}
        }

        if (fetchedData) {
          res = fetchedData;
        } else if (typeof apiFetch === 'function') {
          res = await apiFetch(\`/store/products?\${queryString}\`);
        }

        // 404: Mağaza Bulunamadı (Sıfır Veri Sızıntısı Koruması)
        if (res && res.code === 'TENANT_NOT_FOUND') {
          tbody.innerHTML = \`
            <tr>
              <td colspan="7" style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 40px; margin-bottom: 12px;">🏪❌</div>
                <div style="font-size: 1.15rem; font-weight: 700; color: #ef4444; margin-bottom: 8px;">
                  Bayi Mağazası Bulunamadı
                </div>
                <div style="font-size: 0.9rem; color: #64748b; max-width: 500px; margin: 0 auto;">
                  "<strong>\${escapeHtml(activeSlug)}</strong>" alan adına ait kayıtlı bir bayi mağazası bulunamadı. Lütfen URL adresini kontrol ediniz.
                </div>
              </td>
            </tr>
          \`;
          if (emptyState) emptyState.style.display = 'none';
          allProducts = [];
          allProductsData = [];
          return;
        }

        // 403: Onay Bekliyor / Pasif Durum Koruması
        if (res && (res.code === 'TENANT_PENDING_APPROVAL' || res.code === 'TENANT_REJECTED' || res.code === 'TENANT_INACTIVE')) {
          tbody.innerHTML = \`
            <tr>
              <td colspan="7" style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 40px; margin-bottom: 12px;">⏳🔒</div>
                <div style="font-size: 1.15rem; font-weight: 700; color: #f59e0b; margin-bottom: 8px;">
                  Bayi Mağazası Erişime Kapalı
                </div>
                <div style="font-size: 0.9rem; color: #64748b; max-width: 500px; margin: 0 auto;">
                  \${escapeHtml(res.message || 'Bu bayi mağazası onay aşamasında veya geçici olarak pasiftir.')}
                </div>
              </td>
            </tr>
          \`;
          if (emptyState) emptyState.style.display = 'none';
          allProducts = [];
          allProductsData = [];
          return;
        }

        if (res && (res.success || Array.isArray(res.data))) {
          allProducts = Array.isArray(res.data) ? res.data : [];
          allProductsData = [...allProducts];
          renderProductTable();
        } else {
          allProducts = [];
          allProductsData = [];
          renderProductTable();
        }
      } catch (err) {
        console.error('[LOAD_PRODUCTS_ERROR]:', err);
        allProducts = [];
        allProductsData = [];
        renderProductTable();
      }
    }

    // --------------------------------------------------------------------------
    // 4. ÜRÜN TABLOSUNU ÇİZME (PARTSOUQ DATA TABLE FORMATI)
    // --------------------------------------------------------------------------
    function renderProductTable()`;

content = content.replace(oldLoadProductsRegex, newLoadProducts);

fs.writeFileSync(storeHtmlPath, content, 'utf8');
console.log('Successfully updated storefront-ui/store.html');

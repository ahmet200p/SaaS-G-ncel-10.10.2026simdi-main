/**
 * SaaS Otomotiv Çözümleri - Dinamik Login ve Rol Bazlı Yönlendirme (Routing) Motoru
 * prompt.md ADIM 1 & ADIM 2 Tam Uyumluluk
 */

(function () {
  'use strict';

  /**
   * Rol bazlı dinamik yönlendirme adresi hesaplar
   * @param {string} role - Kullanıcı rolü (SUPER_ADMIN, ADMIN, BAYI, TENANT_ADMIN, MUSTERI, CUSTOMER)
   * @param {string} [serverRedirectUrl] - Backend'den dönen opsiyonel redirectUrl
   * @returns {string} Hedef URL
   */
  function determineRedirectUrl(role, serverRedirectUrl) {
    const rawRole = String(role || '').toUpperCase().trim();
    let target = '';

    // Prompt ADIM 1: switch / if-else yapısı ile rol bazlı yönlendirme
    switch (rawRole) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        target = '/admin.html';
        break;
      case 'BAYI':
      case 'TENANT_ADMIN':
        target = '/bayi.html';
        break;
      case 'MUSTERI':
      case 'CUSTOMER':
        target = '/store.html';
        break;
      default:
        if (serverRedirectUrl) {
          target = serverRedirectUrl;
        } else {
          target = '/bayi.html'; // Güvenli varsayılan (Admin paneline yetkisiz düşmeyi önler)
        }
        break;
    }

    // Dosya protokolü (file://) veya alt klasör (/saas-panel-ui/) durumlarında göreceli yol desteği
    if (typeof window !== 'undefined' && window.location) {
      const isSubDir = window.location.pathname.includes('/saas-panel-ui/');
      const isFileProto = window.location.protocol === 'file:';

      if (isFileProto || isSubDir) {
        if (target === '/admin.html') return 'admin.html';
        if (target === '/bayi.html') return 'bayi.html';
        if (target === '/store.html') return '../storefront-ui/store.html';
      }
    }

    return target;
  }

  /**
   * Ortak Login Formu Submit İşleyicisi
   * @param {Event} e - Submit event
   */
  async function handleLoginSubmit(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    const emailInput = document.getElementById('email') || document.querySelector('input[type="email"]');
    const passwordInput = document.getElementById('password') || document.querySelector('input[type="password"]');
    const errorDiv = document.getElementById('error-msg') || document.getElementById('errorMessage') || document.querySelector('.error-msg');
    const btnLogin = document.getElementById('btn-login') || document.querySelector('button[type="submit"]');

    if (errorDiv) {
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
    }

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value.trim() : '';

    if (!email || !password) {
      if (errorDiv) {
        errorDiv.textContent = 'Lütfen e-posta ve şifrenizi eksiksiz giriniz.';
        errorDiv.style.display = 'block';
      }
      return;
    }

    const originalBtnText = btnLogin ? btnLogin.innerHTML : 'Giriş Yap';
    if (btnLogin) {
      btnLogin.disabled = true;
      btnLogin.textContent = 'Giriş Yapılıyor...';
    }

    try {
      let res;
      // Eğer projede apiFetch fonksiyonu mevcutsa onu kullan, yoksa doğrudan fetch ile çağır
      if (typeof window.apiFetch === 'function') {
        res = await window.apiFetch('/auth/login', {
          method: 'POST',
          body: { email, password }
        });
      } else {
        const apiUrl = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL)
          ? `${window.API_BASE_URL}/auth/login`
          : '/api/auth/login';

        const rawResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        res = await rawResponse.json();
      }

      // Backend başarılı yanıt döndü mü?
      const isSuccess = res && (res.success === true || res.token);
      if (isSuccess && res.token) {
        // Token ve Kullanıcı Bilgilerini localStorage'a kaydet
        localStorage.setItem('token', res.token);
        if (res.user) {
          localStorage.setItem('user', JSON.stringify(res.user));
          if (res.user.tenantId) {
            localStorage.setItem('tenantId', res.user.tenantId);
          }
        }

        // Rol bilgisini çözümle (res.role, res.user.role veya res.standardRole)
        const userRole = res.role || (res.user && res.user.role) || res.standardRole || '';
        
        // Dinamik hedef URL'yi belirle
        const targetUrl = determineRedirectUrl(userRole, res.redirectUrl);
        
        console.log(`[AUTH_ROUTING] Giriş başarılı. Rol: ${userRole} -> Hedef: ${targetUrl}`);
        window.location.href = targetUrl;
      } else {
        const errorText = (res && res.message) ? res.message : 'Hatalı e-posta adresi veya şifre!';
        if (errorDiv) {
          errorDiv.textContent = errorText;
          errorDiv.style.display = 'block';
        }
        if (btnLogin) {
          btnLogin.classList.remove('btn-shake');
          void btnLogin.offsetWidth;
          btnLogin.classList.add('btn-shake');
          setTimeout(() => btnLogin.classList.remove('btn-shake'), 500);
        }
      }
    } catch (err) {
      console.error('[AUTH_LOGIN_ERROR]:', err);
      if (errorDiv) {
        errorDiv.textContent = (err && err.message) || 'Giriş işlemi sırasında bağlantı hatası oluştu.';
        errorDiv.style.display = 'block';
      }
    } finally {
      if (btnLogin) {
        btnLogin.disabled = false;
        btnLogin.innerHTML = originalBtnText;
      }
    }
  }

  // Dışa aktarma ve global bağlama
  window.handleLoginSubmit = handleLoginSubmit;
  window.determineRedirectUrl = determineRedirectUrl;

  // DOM Yüklendiğinde Form submit olayını otomatik bağla
  document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('login-form') || document.querySelector('form.auth-form');
    if (loginForm) {
      loginForm.addEventListener('submit', handleLoginSubmit);
    }
  });
})();

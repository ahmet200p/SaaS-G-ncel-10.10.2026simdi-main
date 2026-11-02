# KRİTİK GÖREV: Login Yönlendirme (Routing) Hatası ve Rol Bazlı Erişim Düzeltmesi

**HATA TESPİTİ:**
Frontend'deki ortak login ekranından giriş yapıldığında, kullanıcı 'BAYI' rolüne sahip olsa bile sistem onu yanlışlıkla Admin paneline (`admin.html`) yönlendirmeye çalışıyor ve bu yüzden yetki hatası patlıyor. 

Lütfen Login fonksiyonunu (`login.js` veya ilgili JS dosyası) ve Backend yetki kontrolünü şu şekilde düzelt:

### ADIM 1: FRONTEND DİNAMİK YÖNLENDİRME (ROUTING)
- Login formunun `submit` event'ini kontrol et. `fetch` isteği başarılı olduğunda Backend'den dönen JWT token'ı ve `role` bilgisini al.
- `if/else` veya `switch` bloğu ile rol bazlı yönlendirme kurgula:
  - Eğer `role === 'SUPER_ADMIN'` ise `window.location.href = '/admin.html'` (veya admin klasör yolu).
  - Eğer `role === 'BAYI'` ise `window.location.href = '/bayi.html'`.
  - Eğer `role === 'MUSTERI'` ise `window.location.href = '/store.html'` (veya vitrin ana sayfası).

### ADIM 2: BACKEND LOGIN YANITI (PAYLOAD GÜNCELLEMESİ)
- Backend'de (Render'da) `POST /api/auth/login` endpoint'ini kontrol et. 
- Sadece `token` dönmek yetmez; Frontend'in doğru yönlendirme yapabilmesi için yanıtın (response) içine kullanıcının rolünü de açıkça ekle:
  `res.status(200).json({ token: token, role: user.role, redirectUrl: ... })`

**UYARI (TEHLİKELİ SİTE İÇİN):**
Google'ın "Tehlikeli Site" uyarısı, login sayfasındaki form yapısından dolayı geçici olarak devam edebilir. Testleri sürdürmek için uyarı ekranındaki "Ayrıntılar" -> "Bu güvenli olmayan siteye git" linkini kullanmaya devam et.
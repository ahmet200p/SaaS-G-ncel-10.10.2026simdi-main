"Sistem mimarisinde 'SaaS Admin/Bayi Paneli' ile 'Müşteri Vitrini (Storefront)' arasındaki bağlantıları tamamen ayırmamız (Decoupling) gerekiyor. Müşterilerin, bayinin kendi domaini veya subdomaini üzerinden siteye girmesi, SEO uyumlu bir deneyim yaşaması ve çıkış yaptıklarında ana SaaS paneline yönlendirilmemesi için şu 5 adımı eksiksiz, güvenlik standartlarına uyarak uygula:

1. ADIM: Çıkış (Logout) Yönlendirmesinin Ayrıştırılması

store.html (Müşteri Vitrini) içindeki çıkış yapma fonksiyonunu güncelle. Kullanıcı çıkış yaptığında token'ı sil, ancak onu genel SaaS login.html sayfasına YÖNLENDİRME.

Bunun yerine, sayfanın kendisini yenile (reload) veya bayinin vitrin ana sayfasına (/ veya store.html) ziyaretçi (guest) statüsünde geri at.

2. ADIM: Ziyaretçi Modu ve SEO Uyumluluğu (Public Access)

store.html sayfası açıldığında, eğer kullanıcıda bir token yoksa (giriş yapmamışsa) sayfayı engelleme veya login'e atma. Sayfa açılmaya devam etsin (Google SEO botları için bu şarttır).

Güvenlik Kuralı: Ziyaretçi modunda katalog ve ürünler listelensin ancak 'B2B Fiyatı', 'Stok Durumu' ve 'Sepete Ekle' butonları gizlensin. Bunların yerine 'Fiyatları görmek için giriş yapın veya kayıt olun' uyarısı gösterilsin.

3. ADIM: Kimlik Doğrulama (Auth) Rotalarının İzolasyonu

Backend tarafında müşteri ve bayi girişlerini ayır.

POST /api/auth/tenant-login (Bayi yöneticileri için) ve POST /api/auth/customer-login (Ustalar/Tamirciler için) şeklinde iki ayrı rota oluştur.

Müşteri (Customer) token'ı oluşturulurken payload içine kesinlikle role: 'CUSTOMER' ve müşterinin kayıtlı olduğu bayinin ID'sini (tenantId) ekle.

4. ADIM: Çapraz Yetki İhlali (Privilege Escalation) Koruması

middleware/auth.js dosyasını güncelle. role: 'CUSTOMER' olan bir token'ın, bayi yönetimine ait hiçbir rotaya (/api/tenant/...) erişemeyeceğini katı bir şekilde denetle. Müşteri token'ı ile bayi paneline istek atılırsa anında 403 Forbidden döndür.

5. ADIM: Tenant Algılama (Subdomain/Slug Resolution)

Müşteri vitrini frontend'i (Örn: store.html), sayfa yüklendiğinde hangi bayinin mağazasında olduğunu URL'den (Örn: ahmetoto.saas.com subdomain'inden veya ?tenant=ahmetoto parametresinden) dinamik olarak algılasın.

API'ye atılan tüm ürün çekme isteklerinde (GET /api/store/products) bu bayi kimliğini (Örn: X-Tenant-Slug header'ı ile) göndersin ki backend hangi bayinin vitrinini ve ürünlerini göstereceğini bilsin."
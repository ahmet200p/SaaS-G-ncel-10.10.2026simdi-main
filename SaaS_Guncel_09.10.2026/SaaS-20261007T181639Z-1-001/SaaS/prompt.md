"Sistemde Bayi (Tenant) hesabını onayladıktan sonra Bayi portalına giriş yaptım. Ancak sol menüden sekmelere tıkladığımda /api/orders, /api/products, /api/customers, /api/discounts ve /api/returns endpoint'lerine gelen GET istekleri 400 Bad Request hatası döndürüyor.

Lütfen bu endpoint'lerin bağlı olduğu Controller'ları ve Middleware (özellikle yetkilendirme ve tenant doğrulama) dosyalarını kontrol et.

Backend, bu isteklerde zorunlu bir Tenant-ID header'ı, Authorization token'ı veya page/limit gibi zorunlu query parametreleri bekliyor ve bulamadığı için 400 döndürüyor olabilir mi?

Lütfen bu endpoint'lere gelen hatalı istekleri (req.headers, req.query) konsola yazdıracak loglar (console.error) ekle ve validation (doğrulama) kurallarını kontrol ederek hatayı düzelt."
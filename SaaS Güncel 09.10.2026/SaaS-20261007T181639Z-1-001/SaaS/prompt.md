"Vitrin (Frontend) ile Backend arasındaki API Key iletişiminde güvenlik sınırlarını netleştirmemiz gerekiyor. Lütfen sistemde şu 3 kuralın aktif olduğundan emin ol ve eksikse kodları güncelle:

Yetki Kısıtlaması (Read-Only): tenant.apikey (Vitrindeki Publishable Key) SADECE mağaza kataloğunu listeleme, ürün detaylarını çekme ve ziyaretçi/müşteri işlemleri için kullanılabilsin. Bu key ile hiçbir /api/admin veya /api/tenant-management rotasına (ürün ekleme, fiyat değiştirme, bayi ayarları) erişilemesin.

Sıkı CORS Kontrolü: İstek backend'e ulaştığında, sadece API Key'in doğruluğu yetmez. İsteğin geldiği Origin (Örn: ahmetoto.com) ile veritabanındaki bayiye kayıtlı customDomain birebir eşleşmek ZORUNDADIR. Eşleşmiyorsa 403 hatası fırlat.

Backend Veritabanı: Eğer API key'leri veritabanında tutuyorsak, güvenlik standartları gereği bunları bcrypt veya sha256 ile hash'leyerek kaydet (Opsiyonel ama önerilen). Frontend'den gelen key'i bu hash ile karşılaştır."
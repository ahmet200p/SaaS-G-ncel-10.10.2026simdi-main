"Bayi portalında (bayi.html) bulunan tüm sekmelerdeki (Dashboard, Katalog, Müşteriler, Fiyat ve İskonto) istatistiklerin ve KPI kutularının sıfırdan ve tamamen organik çalışmasını istiyorum. Sistemdeki örnek/test amaçlı girilmiş tüm verileri temizlemek ve statik HTML sayılarını kaldırmak için şu adımları uygula:

1. ADIM: Veritabanı Sıfırlama (Test Verilerini Silme)

Backend tarafında (Prisma kullanarak) sisteme daha önce eklenmiş olan tüm sahte verileri temizle.

CustomerProfile (Otoservis Müşterileri), Product (Katalog Ürünleri), DiscountRule (İskonto Kuralları) ve varsa kalan Order kayıtlarını veritabanından tamamen sil. (Sadece Süper Admin ve Bayi giriş hesapları - User tablosundaki yetkililer kalsın).

2. ADIM: HTML'deki Statik (Sahte) Verileri Temizleme

bayi.html dosyasını aç. Özellikle 'Fiyat ve İskonto Yönetimi' (#view-discount) sekmesindeki KPI kutularını kontrol et.

HTML içine statik olarak yazılmış '2' (Kayıtlı Servis Sayısı), '%22.5' (Ortalama İskonto Oranı) gibi sahte rakamları HTML'den tamamen sil.

Bu rakamların yerlerine sadece <span id="stat-customer-count">0</span>, <span id="stat-avg-discount">%0</span> gibi başlangıç değeri sıfır olan ve JS üzerinden güncellenecek boş alanlar (ID'ler) bırak.

3. ADIM: JavaScript Dinamik Hesaplama Kontrolü

JS dosyasında istatistikleri ekrana basan fonksiyonların (örn: loadDiscounts, loadDashboardStats) API'den gelen gerçek yanıtlara göre çalıştığından emin ol.

API'den gelen veri dizisi (array) boş ise (length === 0), sayfadaki tüm sayaçların, ciro hesaplarının ve ortalamaların ekranda 0 veya %0 olarak görünmesini sağlayan kontrolleri (if bloklarını) ekle.

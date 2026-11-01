# PROJE GÖREVİ: Pazarlama ve Büyüme (Growth) Modülleri - Backend Mimarisi

**GÖREV BİLDİRİMİ:**
Sistemin kendi kendini pazarlaması ve yönetime analitik veri sağlaması için 3 kritik modülün arka planını (Veritabanı ve API) yazacaksın. Aşağıdaki Prisma şema güncellemelerini ve endpoint'leri derhal oluştur:

**1. PRISMA SCHEMA GÜNCELLEMELERİ:**
Şemaya şu iki yeni modeli ekle:
- `NoHitLog` (Kayıp Arama Günlüğü): Bayilerin aratıp bulamadığı parça ve şasileri izlemek için. Alanlar: `id`, `searchTerm` (Aranan Şasi veya Parça), `searchType` (VIN veya OEM), `userId` (Aramayı yapan bayi), `createdAt`.
- `CustomerQuote` (Müşteri Teklifi): WhatsApp'tan paylaşılacak teklifleri kaydetmek için. Alanlar: `id` (UUID - public link için), `userId`, `customerName`, `totalPrice`, `items` (JSON formatında parçalar), `createdAt`.

**2. API ENDPOINT'LERİ:**
- **Kayıp Arama (No-Hit) API'si:** `POST /api/analytics/no-hit` -> Frontend'de arama sonucu '0' döndüğünde tetiklenecek. Aranan kelimeyi `NoHitLog` tablosuna sessizce (200 OK) kaydedecek.
- **Teklif Oluşturma API'si:** `POST /api/quotes/generate` -> Bayi sepetindeki veya arama sonucundaki ürünleri yolladığında, bunu `CustomerQuote` tablosuna yazıp dışarıdan erişilebilir benzersiz bir URL (Örn: `/quote/:uuid`) dönecek.
- **Görsel Hotspot (Şema Koordinat) Desteği:** Mevcut Katalog Arama API'sini güncelle. Eğer Parts Catalog sağlayıcısı resimlerle birlikte parça koordinatlarını (x,y pozisyonları veya hotspots) dönüyorsa, bunları ZORUNLU olarak JSON payload'unda `images[].hotspots` dizisi olarak frontend'e ilet.

Kodu yaz, Prisma migrate işlemini yap ve endpoint'leri frontend'in tüketimine hazırla.
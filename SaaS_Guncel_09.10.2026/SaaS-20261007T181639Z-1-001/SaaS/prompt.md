# PROJE GÖREVİ: "Oto Servis & Usta" Sadakat Modülleri - Backend Mimarisi

**GÖREV BİLDİRİMİ:**
B2B AFS Systems platformuna ustaların işini kolaylaştıracak ve platform bağımlılığını artıracak 3 yeni modül ekliyoruz: Akıllı Garaj, Bakım Kitleri (Çapraz Satış) ve İşçilik Süresi. Aşağıdaki veritabanı (Prisma) ve API güncellemelerini kusursuz bir şekilde uygulamanı emrediyorum.

**1. PRISMA SCHEMA GÜNCELLEMESİ (Akıllı Garaj Modülü):**
Sisteme ustaların kendi müşterilerini ve araçlarını kaydedebileceği bir tablo ekle.
- `GarageVehicle` adında bir model oluştur.
- Alanlar: `id`, `userId` (Bayi/Usta ID'si ile ilişkili), `vin` (Şasi Numarası), `plate` (Plaka - Opsiyonel), `customerName` (Araç Sahibi), `lastServiceDate` (Son Bakım Tarihi), `createdAt`, `updatedAt`.
- Bir ustanın (User) birden fazla aracı (GarageVehicle) olabilsin (One-to-Many).

**2. GARAJ API ENDPOINT'LERİ (CRUD):**
- `POST /api/garage` -> Şasi arama sonucundan dönen bir aracı tek tıkla ustanın garajına kaydetmek için. (vin, plate, customerName alacak).
- `GET /api/garage` -> Ustanın kaydettiği tüm araçları listelemek için.
- `GET /api/garage/history/:vin` -> Belirli bir şasiye geçmişte bu usta tarafından hangi parçaların sipariş edildiğini getiren sorgu.

**3. BAKIM KİTLERİ VE ÇAPRAZ SATIŞ (Cross-Sell Engine):**
- Parça arama (Katalog) API'sini güncelle. Eğer kullanıcı 'Triger Kayışı' (veya belirli anahtar kelimelere sahip bir parça) aratıyorsa, JSON yanıtına `recommendedTogether` (Birlikte Alınanlar) adında bir dizi (array) ekle.
- Şimdilik bu dizinin içine mantıksal olarak ilişkili parçaları (Örn: Triger aratana -> Devirdaim Pompası, Rulman) parça grubuna göre eşleştirip döndür. Amaç sepet ortalamasını artırmaktır.

**4. İŞÇİLİK VE BAKIM SÜRESİ (Labor Time):**
- Parça detay API yanıtındaki `technicalSpecs` objesinin içine `estimatedLaborTime` (Tahmini İşçilik Süresi) adında bir alan ekle. 
- API/Katalog sağlayıcısından bu veri geliyorsa doğrudan yansıt, gelmiyorsa yedek parça kategorisine göre (Örn: Fren balatası için "45 Dk", Triger için "3 Saat", Filtre grubu için "30 Dk") koda basit bir tahmini eşleştirme (mapping) fonksiyonu yazarak bu veriyi frontend'e kesin olarak gönder.

Kodu yaz, Prisma migrate işlemini hatırlat ve endpointleri hazırla.
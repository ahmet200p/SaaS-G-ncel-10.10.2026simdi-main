# GÖREV: AFS Systems Merkezi Backend Mimarisi (Çoklu Rol ve CORS)

Lütfen Backend (Node.js/Express ve Prisma) altyapısını "Tek Çatı, Çift Kapı" (Headless) modeline göre yeniden yapılandır. Şu adımları uygula:

1. PRISMA SCHEMA & ROLLER: `User` modeline `role` (Enum: `ADMIN`, `BAYI`, `MUSTERI`) ekle. `Product` modelini `BAYI` ile, `Order` modelini `MUSTERI` ile ilişkilendir.
2. GÜVENLİK (JWT): `POST /api/auth/login` endpoint'ini güncelle. Üretilen JWT payload'una kullanıcının `role` bilgisini kesinlikle ekle. `verifyBayi` ve `verifyMusteri` adında role özel middleware'ler yaz.
3. ROUTE İZOLASYONU: Endpointleri ayır.
   - `/api/store/products` (Müşteri vitrini için filtrelemeye uygun GET).
   - `/api/store/orders` (Müşteri sipariş alımı POST).
   - `/api/bayi/products` (Sadece yetkili bayilerin kendi ürünlerini ekleyip/silebileceği CRUD işlemleri).
4. CORS AYARI: `server.js` içine `cors` middleware'ini ekle. `origin: '*'` (veya spesifik Netlify/Frontend URL'leri) iznini tanımla.
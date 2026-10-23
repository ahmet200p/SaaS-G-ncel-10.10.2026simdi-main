"Admin panelinden GET /api/tenants ve GET /api/pending-tenants (veya ilgili endpoint'lere) istek atıldığında backend 500 Internal Server Error döndürüyor.

Bu endpoint'lerdeki bayi listeleme (tenant fetch) fonksiyonlarını kontrol et.

Veritabanından veriyi çeken Prisma sorgularında bir hata, eksik ilişki (relation) veya tip uyumsuzluğu var ve sunucuyu çökertiyor.

İlgili controller'lara detaylı hata loglaması (console.error) içeren try-catch blokları ekle ve veritabanı sorgusundaki problemi gidererek bayilerin JSON formatında hatasız bir şekilde dönmesini sağla."
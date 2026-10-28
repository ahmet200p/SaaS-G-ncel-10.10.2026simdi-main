Canlı (production) veritabanındaki yönetici şifresini '123456' olarak güncellemem gerekiyor. Lütfen ana dizinde update_prod_password.js adında tek seferlik bir Node.js betiği oluştur.

Betik, Prisma Client'ı başlatsın ve ahmet@ahmetoto.com (veya mevcut admin e-postası) kullanıcısını veritabanında bulsun.

bcrypt (10 salt round) kullanarak '123456' şifresini hashlesin ve kullanıcının şifresini bu yeni hash ile güncellesin.

Bu işlemi yaparken Prisma'nın ortam değişkenlerinden (process.env.DATABASE_URL) gelen bağlantıyı kullandığından emin ol.
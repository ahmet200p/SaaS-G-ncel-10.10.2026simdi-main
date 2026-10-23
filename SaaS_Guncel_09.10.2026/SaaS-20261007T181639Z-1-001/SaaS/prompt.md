"Bayi onaylama (approve) işlemi sırasında Prisma'dan şu hatayı alıyorum: Invalid prisma.tenant.update() invocation: Unknown argument 'status'.

Bu hata, backend controller'ımızın Tenant tablosunu güncellerken status: 'APPROVED' verisini yolladığını, ancak schema.prisma dosyasındaki Tenant modelinde status adında bir alan olmadığını gösteriyor.

Lütfen şunları yap:

schema.prisma dosyasındaki Tenant modelini kontrol et. Onay durumu için halihazırda hangi alan kullanılıyor? (Örneğin isActive, approvalStatus vb. mi var?)

Eğer onay durumu için farklı bir alan varsa (örn: isActive: true), bayi onaylama controller'ını status yerine bu doğru alanı güncelleyecek şekilde düzelt.

Eğer Tenant modelinde onay durumunu tutacak hiçbir alan yoksa, schema.prisma dosyasına status String @default("PENDING") (veya projenin yapısına uygun bir enum/boolean) ekle, ardından veritabanını güncellemek için gerekli Prisma migrate/push komutlarını çalıştır."
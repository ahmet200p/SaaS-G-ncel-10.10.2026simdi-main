"Sistemimizde bir onay mantığı sorunu var. Yeni bir bayi (Tenant) kayıt olduğunda, veritabanına yazılıyor ve sisteme login olabiliyor. Ancak Admin paneline veri sağlayan bayi listeleme API'mizde (muhtemelen GET /tenants veya ilgili admin endpoint'i) bu yeni onaysız kayıtlar listelenmiyor.

Kayıt (Register) işlemi sırasında User ve Tenant tabloları arasındaki ilişkinin eksiksiz kurulduğundan emin ol.

Admin panelini besleyen bayi listeleme API'sinin, sadece 'aktif/onaylı' olanları değil, durumu 'onay bekliyor (pending)' olan bayileri de döndürecek şekilde filtrelemesini düzelt. Admin'in tüm kayıtları görebilmesi gerekiyor.

Admin'in durumu 'pending' olan bir bayiyi 'active' yapabilmesi için gerekli onaylama (approve/update) endpoint'inin çalıştığından emin ol."
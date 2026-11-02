# GÖREV: Boş Ürün Listesi (Sıfır Hata, Sıfır Veri) Sorununun Giderilmesi

**DURUM:** Frontend (`store.html`) sorunsuz bir şekilde Backend'e (Render) bağlanıp 200 OK yanıtı alıyor, konsolda hata yok. Ancak Bayi panelinden eklenen ürünler Vitrin ekranına düşmüyor (Liste boş veya array uyuşmazlığı var).

Lütfen Frontend ve Backend arasındaki veri akışını eşleştirmek için şu 3 adımı uygula:

### ADIM 1: FRONTEND VERİ EŞLEŞTİRMESİ (MAPPING KONTROLÜ)
- `store.html` (veya ilgili JS) içindeki `fetchProducts` fonksiyonuna git. 
- Gelen veriyi döngüye sokmadan hemen önce konsola yazdır: `console.log("Gelen Veri:", data);`
- Backend veriyi `{ success: true, data: [...] }` formatında sarmalıyorsa, frontend'deki döngünün `data.map` değil KESİNLİKLE `data.data.map` olduğundan emin ol. (Veya backend direkt array dönüyorsa frontend'i buna göre düzelt).
- HTML şablonunun içindeki değişkenlerin (Örn: `${product.name}`, `${product.price}`) Prisma modelindeki sütun isimleriyle BİREBİR aynı olduğunu kontrol et.

### ADIM 2: BACKEND PRISMA FİLTRELERİNİ ESNETME
- Backend'de `GET /api/store/products` (veya ilgili endpoint) route'unu bul.
- Eğer Prisma sorgusunda `where: { isActive: true }` veya `status: 'APPROVED'` gibi filtreler varsa, test amaçlı bu `where` bloğunu GEÇİCİ OLARAK YORUMA AL VEYA SİL. Belki bayi paneli ürünü eklerken varsayılan olarak `isActive: false` atıyordur.
- Vitrinde tüm ürünler koşulsuz listelenecek şekilde `findMany()` sorgusunu sadeleştir.

### ADIM 3: BAYİ PANELİ VERİTABANI KONTROLÜ (DB URL)
- Bayi panelinin (`bayi.html`) ürün eklemek için istek attığı POST URL'sinin de KESİNLİKLE Render üzerindeki canlı API'ye (`https://saas-g-ncel-10-10-2026simdi-main.onrender.com/api/...`) gittiğinden emin ol. 
- Eğer Bayi paneli eski `localhost` API'sine istek atıyorsa, ürün senin bilgisayarındaki lokal veritabanına kaydolur ama vitrin Render'dan okumaya çalıştığı için boş gelir. Her iki panelin de AYNI canlı adrese bağlı olduğunu doğrula.

**EMİR:** Sorun kod hatası değil, veri objesi eşleşme (JSON mapping) veya veritabanı farklılığı sorunudur. `console.log` ile verinin nerede kaybolduğunu tespit et ve eşleştir.
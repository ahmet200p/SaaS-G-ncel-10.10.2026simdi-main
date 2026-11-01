# KRİTİK HATA ÇÖZÜMÜ: Sipariş Tamamlama (Checkout) 500 Hatası ve Auth (401) Sorunu

**HATA TESPİTİ:**
Vitrin sayfasında (`store.html`) sipariş tamamlama (veya teklif oluşturma) işlemi sırasında zincirleme hatalar yaşanıyor. 
1. Önce `401 Unauthorized` hatası dönüyor ve sistem "Ziyaretçi Moduna" düşüyor.
2. Ziyaretçi modundayken sipariş tamamlanmaya çalışıldığında, Backend `500 Internal Server Error` vererek çöküyor (Büyük ihtimalle `userId` null olduğu için Prisma kaydı reddediyor).

Lütfen şu iki düzeltmeyi DERHAL yap:

### 1. FRONTEND KONTROLÜ (`api.js` veya `store.html` sipariş fonksiyonu):
- Siparişi Tamamla / Teklif Gönder butonuna basıldığında tetiklenen `fetch` isteğini bul.
- Bu isteğin `headers` kısmına kullanıcının oturum token'ının (Örn: `localStorage.getItem('token')`) eklendiğinden %100 emin ol.
- EĞER kullanıcı giriş yapmamışsa (token yoksa), `fetch` isteğini hiç başlatmadan ekrana anında `alert` veya modal ile "Lütfen siparişi tamamlamak için Bayi Girişi yapınız" uyarısı ver. Kimliksiz istek atılmasını fronted'de engelle.

### 2. BACKEND KONTROLÜ (Sipariş/Teklif Oluşturma Endpoint'i):
- Siparişi karşılayan endpoint'e (URL'de `subdomain=...` query'si alan controller'a) git.
- Fonksiyonun içine kapsamlı bir `try/catch` bloğu ekle. 
- Eğer `req.user` veya `req.body.userId` eksikse sunucuyu çöktürmek (500) yerine, frontend'e düzgün bir HTTP `401` veya `403` JSON hatası dön (`{ error: "Oturum süreniz dolmuş, lütfen tekrar giriş yapın." }`).
- 500 hatasının asıl sebebini görmek için catch bloğuna `console.error(error)` ekle ki terminalde Prisma'nın tam olarak nerede patladığını görebilelim.

Bu düzeltmeleri yap ve sipariş akışının B2B yetkilendirme mantığına uygun çalışmasını sağla.
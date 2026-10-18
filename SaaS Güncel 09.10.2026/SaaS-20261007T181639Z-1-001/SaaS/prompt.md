"Bayi kayıt işlemlerinde sahte hesapları engellemek için sisteme %100 ücretsiz olan Devlet (NVİ) TC Kimlik No Doğrulama sistemini entegre edeceğiz. Lütfen şu üç adımı eksiksiz uygula:

1. Frontend (Arayüz) Güncellemesi:
saas-panel-ui klasöründeki bayi kayıt formuna (Register Modal/Form) 'Ad', 'Soyad' ve 'TC Kimlik No' alanlarına ek olarak zorunlu bir 'Doğum Yılı' (Sadece 4 haneli yıl, Örn: 1990) input'u ekle. Form verilerini toplarken bu 4 verinin boş olmadığından emin ol.

2. Backend Bağımlılıkları:
backend-api klasörüne giderek npm install soap komutuyla gerekli paketi kur.

3. NVİ KPS Public SOAP Entegrasyonu:
backend-api/controllers/authController.js (veya kayıt işlemini yöneten controller) içerisine, kayıt öncesi NVİ servisinden doğrulama yapan bir helper fonksiyon ekle.

Servis Adresi: [https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx?WSDL](https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx?WSDL)

Fonksiyon, kullanıcıdan gelen TCKimlikNo, Ad, Soyad ve DogumYili verilerini NVİ TCKimlikNoDogrula metoduna göndersin.

Türkçe karakter duyarlılığı (Örn: 'i' harfinin 'İ' veya 'I' olması durumu) NVİ tarafında çok hassastır, bu yüzden gelen isim ve soyisim değerlerini NVİ'ye göndermeden önce mutlaka Türkçe karakterleri koruyarak tamamen Büyük Harfe çeviren (Örn: isim.toLocaleUpperCase('tr-TR')) bir filtre uygula.

Eğer NVİ'den dönen sonuç false ise (veya servis hata verirse), veritabanına kayıt işlemini anında iptal edip frontend'e 400 Bad Request: Girdiğiniz kimlik bilgileri devlet kayıtlarıyla uyuşmuyor. hatasını fırlat."
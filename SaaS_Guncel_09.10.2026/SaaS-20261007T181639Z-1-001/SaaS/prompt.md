# KRİTİK GÖREV: UI Yanlış Konumlandırma Temizliği ve `store.html` Entegrasyonu

**DURUM BİLDİRİMİ VE ZORUNLU KABUL:**
Önceki adımlarda "Akıllı Garaj", "İşçilik Süresi" ve "Bakım Kiti" modüllerini ısrarla `bayi.html` (bayi yönetim/stok ekleme) dosyasına entegre ettin. **Bu tamamen yanlıştır ve iptal edilmiştir.** Bu özellikler bayinin stok eklediği yerde değil, müşterinin/ustanın parça satın aldığı B2B Vitrin'de (`store.html`) olmak ZORUNDADIR. 
Aşağıdaki adımları sırasıyla, itiraz etmeden ve başka bir alternatif sunmadan uygulayacaksın.

### ADIM 1: `bayi.html` DOSYASININ TAMAMEN TEMİZLENMESİ
1. `bayi.html` dosyasını aç.
2. Önceki adımlarda bu dosyaya eklediğin "Garajımdan Seç", "Tahmini İşçilik" ve "Çapraz Satış (Birlikte Al)" modüllerine ait **TÜM HTML kodlarını, butonları ve JavaScript fetch/DOM manipülasyon fonksiyonlarını KESİNLİKLE SİL.**
3. `bayi.html` içindeki "Yeni Ürün Ekle" modalı veya diğer alanlar tamamen eski (sade) haline geri dönsün. Bu dosyada sadakat modülüne dair tek bir satır kod kalmayacak.

### ADIM 2: `store.html` (B2B VİTRİN) DOSYASINA ENTEGRASYON VE YERLEŞİM
Şimdi tüm bu modülleri asıl yeri olan `store.html` dosyasına inşa edeceksin.

**A. Üst Navigasyon & Kullanıcı Menüsü:**
- Sayfanın en üstünde yer alan (içinde Sepet ikonu ve Kullanıcı Profili olan) Header/Navigasyon barına **"🚗 Garajım"** adında şık bir buton ekle.
- Bu butona tıklandığında, kullanıcının daha önce kaydettiği araçları (Plaka ve Müşteri Adı ile) listeleyen ufak bir dropdown açılsın. Buradan seçilen aracın Şasi Numarası otomatik olarak arama çubuğuna aktarılsın.

**B. Sol "Katalog Filtreleri" Alanı (Sidebar):**
- Ekrandaki "Katalog Filtreleri" kısmında, 'Araç Markası' Bento seçim grid'inin hemen üstüne veya altına **"Akıllı Garaj (Hızlı Araç Seçimi)"** adında yeni bir panel (div) yerleştir.
- Bu panelin içine, kullanıcının hızlıca garajındaki kayıtlı araçları seçebileceği bir `<select>` (Dropdown) elementi koy. "Garajdan seçilen araç" ile arama doğrudan tetiklensin.

**C. Ürün Detay ve Arama Sonuçları (Orta/Sağ Alan):**
- `store.html` içindeki arama sonuçlarının listelendiği ürün kartlarına (Product Card) veya tabloya, Backend'den gelecek olan `estimatedLaborTime` verisini basan **"Tahmini İşçilik: X Saat"** rozetini ekle.
- Bir ürüne tıklandığında (veya detayına girildiğinde) sayfanın altına **"💡 Bu parçayı alanlar şunları da aldı (Bakım Kiti)"** yatay kaydırılabilir (scrollable) listesini yerleştir.

**GÖREV KURALI:** Bu değişikliklerin tamamı sadece `store.html` ve ona bağlı JS dosyalarında yapılacaktır. Bu mimari kararı kabul et ve kodu buna göre hemen üretmeye başla.
Kritik Veri Eşleşme (Mapping) Hatası:
Şasi (VIN) sorgusu sonucunda dönen parça ağacında ciddi bir "Veri Kayması (Index Misalignment)" yaşanıyor. Ekranda 'Klima Radyatörü' yazan parçanın yanındaki OEM kodu aslında 'Aydınlatma' parçasına ait çıkıyor. JSON verisi ayrıştırılırken (parse edilirken) parça isimleri ve kodlar birbirine karışıyor.

Lütfen VIN API'sinden gelen veriyi işleyen arama motoru döngüsünü (map/forEach) derhal incele ve şu kuralları uygula:

Parça adı (partName) ve OEM kodu (oemCode) değerlerinin API yanıtındaki aynı (doğru) JSON objesi/düğümü içinden çekildiğinden %100 emin ol. İki farklı diziyi (array) manuel birleştiriyorsan bu işlemi iptal et; veriyi doğrudan ait olduğu benzersiz ID veya obje üzerinden eşle.

API sağlayıcısının (Parts Catalog) orijinal raw JSON yanıtını console.log ile kontrol et. Eğer API'nin kendisi bu veriyi hatalı gönderiyorsa, fetch isteğindeki kategori/grup parametrelerini gözden geçir.

Kod eşleşmesi düzeltilene ve her parça kendi gerçek OEM kodunu gösterene kadar sistemi strict mode'da test et.
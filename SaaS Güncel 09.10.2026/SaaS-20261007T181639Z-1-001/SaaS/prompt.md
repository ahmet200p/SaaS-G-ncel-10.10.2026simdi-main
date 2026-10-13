"Müşteri vitrini (store.html) sayfasındaki sepet sürecini B2B (toptancı-tamirci) gerçeklerine uygun hale getirmek için ödeme adımını yeniden kurgulamanı istiyorum. Şu an 'Siparişi Onayla' butonuna basıldığında sipariş direkt geçiliyor, ancak bunun yerine bir 'Ödeme Yöntemi' seçimi sunmalıyız. Lütfen şu adımları uygula:

1. ADIM: Ödeme Seçenekleri Modalı Tasarımı

Sepetteki 'Siparişi Onayla' butonuna tıklandığında, siparişi hemen API'ye göndermek yerine modal-payment-method adında şık bir ekran (Modal) aç.

Bu modalda alt alta duran 3 farklı ödeme seçeneği (kutu/kart şeklinde) oluştur:

1. Seçenek (Aktif): 'Cari Hesaba Yaz (Veresiye)'

Açıklaması: "Sipariş tutarı cari hesabınıza borç olarak yansıtılacaktır."

2. Seçenek (Aktif): 'Havale / EFT ile Öde'

Açıklaması: "Ödemeyi banka hesabımıza gönderdiğinizde siparişiniz onaylanacaktır."

3. Seçenek (Pasif/Disabled): 'Kredi Kartı ile Öde'

Kutunun rengi soluk olsun ve üzerine veya yanına şık bir "Çok Yakında" rozeti (badge) ekle. Bu seçeneğe tıklanamasın.

2. ADIM: Sipariş Oluşturma (Havale ve Cari Mantığı)

Kullanıcı **'Cari Hesaba Yaz'**ı seçip altındaki 'Siparişi Tamamla' butonuna basarsa:

POST /api/store/orders isteğine paymentMethod: 'CURRENT_ACCOUNT' verisini ekle.

Sipariş bayi paneline 'Hazırlanıyor' statüsünde düşsün.

Kullanıcı 'Havale / EFT' seçeneğini seçerse:

Kutunun altında dinamik olarak bayinin IBAN bilgileri (API'den veya tenant ayarlarından çekilen) belirtsin.

Kullanıcı siparişi tamamladığında POST /api/store/orders isteğine paymentMethod: 'BANK_TRANSFER' verisini ekle.

Sipariş bayi paneline 'Ödeme Bekliyor' statüsünde düşsün.

3. ADIM: Başarı Ekranı ve Yönlendirme

Sipariş API'ye başarılı bir şekilde iletildiğinde SweetAlert2 ile "Siparişiniz Başarıyla Alındı" mesajı göster, sepeti sıfırla ve kullanıcıyı Profil > Siparişlerim sekmesine yönlendir."
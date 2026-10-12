"Müşteri vitrini (store.html) sayfasındaki 'Giriş Yapmış Kullanıcı' bölümünü (Header sağ üst köşe) B2B2C standartlarına uygun, interaktif bir Profil Menüsüne dönüştürmeni istiyorum. Lütfen şu 3 adımı uygula:

1. ADIM: Profil Dropdown (Açılır Menü) Tasarımı

Sağ üst köşedeki Kullanıcı Adı (Örn: 'Kemal Usta') ve Profil İkonunun olduğu div'i tıklanabilir (dropdown-toggle) bir butona dönüştür.

Bu butona tıklandığında (veya üzerine gelindiğinde - hover) hemen altında şık, gölgeli bir açılır menü (Dropdown) belirtsin.

Açılır menü içerisine şu linkleri (veya butonları) ekle:

📦 Siparişlerim (Geçmiş siparişleri listeleyecek modalı açar)

⚙️ Hesap Ayarları (Firma/Şifre değiştirme modalını açar)

🚪 Çıkış Yap (Log out - kırmızı renkte)

2. ADIM: 'Siparişlerim' Modalı (Geçmiş Siparişler)

Sayfaya modal-my-orders adında yeni bir geniş modal ekle.

'Siparişlerim' seçeneğine tıklandığında bu modal açılsın.

İçerisinde, müşterinin daha önce verdiği siparişlerin listelendiği temiz bir tablo olsun (Sipariş No, Tarih, Tutar, Durum - Örn: Hazırlanıyor, Kargolandı).

Backend Bağlantısı: GET /api/store/my-orders endpoint'ine istek atarak kullanıcının kendi token/session'ına ait geçmiş siparişleri çekip bu tabloyu dinamik doldursun.

3. ADIM: 'Hesap Ayarları' Modalı

Sayfaya modal-account-settings adında yeni bir modal ekle.

Kullanıcı buraya girdiğinde adını, telefon numarasını veya e-postasını güncelleyebileceği form alanları bulunsun.

Varsa vergi numarası ve adres gibi detayları da buradan değiştirebilsin (PUT /api/store/profile gibi bir endpoint'e bağlansın).

Not: Sayfadaki genel Bakiye Göstergesi (+22.950,00 ₺) sabit olarak header'da kalmaya devam etsin, sadece ismin olduğu kısım açılır menüye dönüşsün."
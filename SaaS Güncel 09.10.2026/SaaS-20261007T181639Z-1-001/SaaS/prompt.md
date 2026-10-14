"Müşteri vitrini (store.html) sayfasında 'Havale / EFT ile Öde' seçeneğiyle sipariş verildiğinde çıkan standart 'Sipariş alındı' bildirimini daha kurumsal ve bilgilendirici bir yapıya dönüştürmek istiyorum. Lütfen ödeme işlemi tamamlandığında (API'den başarılı yanıt döndüğünde) çalışan JavaScript kodunu şu şekilde güncelle:

1. ADIM: Havale/EFT'ye Özel Kurumsal Başarı Mesajı (SweetAlert2)

Eğer kullanıcının seçtiği ödeme yöntemi BANK_TRANSFER (Havale/EFT) ise, sipariş başarıyla oluşturulduktan sonra ekrana standart mesaj yerine şu özelliklerde şık bir SweetAlert2 (success) modalı çıkart:

Başlık (Title): Siparişiniz Başarıyla Alınmıştır

İçerik (HTML):
'Siparişiniz sistemimize ulaşmıştır. Havale/EFT işleminizin hesaplarımıza yansıması ve muhasebe departmanımızın onayının ardından, ürünleriniz özenle hazırlanarak tarafınıza sevk edilecektir.<br><br><small><b>Önemli Not:</b> Transfer işleminizi gerçekleştirirken açıklama kısmına <b>Firma Adınızı</b> veya sistemin size atadığı <b>Sipariş Numaranızı</b> yazmayı unutmayınız.</small>'

Onay Butonu Metni: 'Siparişlerime Git'

2. ADIM: Yönlendirme (Redirect)

Müşteri SweetAlert2 modalındaki 'Siparişlerime Git' butonuna tıkladığında, sepet modalını kapat ve doğrudan sağ üstteki Profil > 'Siparişlerim' penceresini (veya ilgili sayfayı) otomatik olarak aç.

3. ADIM: Statü Uyumu

Siparişlerim tablosuna gidildiğinde, bu siparişin durumunun turuncu/sarı tonlarında şık bir rozetle 'Ödeme Bekleniyor' veya 'Onay Bekliyor' olarak listelendiğinden emin ol."
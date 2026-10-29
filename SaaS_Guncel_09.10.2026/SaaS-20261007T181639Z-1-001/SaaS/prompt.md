[BACKEND - KESİN GÖREV: ŞASİ (VIN) TO OEM PARÇA AĞACI API'Sİ]

Görev Bildirimi: Sistemdeki mevcut Şasi (VIN) doğrulama endpoint'i, sadece aracın marka/model bilgisini dönmekle kalmayacak; artık o araca ait "Komple Parça OEM Kataloğunu" (Vehicle Parts Tree) getirecek şekilde yeniden yazılacaktır.

KATI KURALLAR:

Geniş Çaplı Katalog Taraması: VIN numarası (örn: VF15R...) ile API'ye istek atıldığında, TecDoc/Katalog sağlayıcısından o şasiye uygun TÜM orijinal yedek parçaları (fren, motor, süspansiyon vb.) topla.

JSON Çıktı Standartı: Yanıtta vehicleInfo (araç künyesi) objesinin yanında kesinlikle compatibleParts adında bir dizi (array) dönülecektir.

Veri Yapısı: Bu dizi içindeki her obje şu formatta olmalıdır: { "partName": "Ön Fren Balata Takımı", "oemCode": "410601241R", "categoryGroup": "Fren Sistemi" }.

Sahte Veri Yasak: Eğer katalog API'si bir şasi için parça ağacı sunmuyorsa, boş dizi [] dönülecek; kesinlikle "Test Parçası 1" gibi sahte mock datalar üretilmeyecektir.

Lütfen Şasi sorgulama controller'ını bu devasa OEM parça ağacını compatibleParts dizisi olarak dönecek şekilde hemen güncelle.
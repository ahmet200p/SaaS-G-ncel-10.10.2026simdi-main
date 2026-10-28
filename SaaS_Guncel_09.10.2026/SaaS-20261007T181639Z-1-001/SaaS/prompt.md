SİSTEM MİMARİSİ VE GÖREV BİLDİRİMİ (CRITICAL TASK)
Bu bir prototip veya deneme sürümü talebi değildir. Canlıya alınacak B2B AFS Systems platformunun kalbi olan "Yedek Parça Arama API'sini (Endpoint)" sıfırdan, endüstri standartlarında (TecDoc/İsmailOto seviyesinde) ve hatasız bir şekilde yeniden inşa etmeni emrediyorum. Sistem, girilen koda göre yüzeysel arama yapmayı derhal bırakacak; bunun yerine agresif ve derinlemesine bir "Çapraz Referans (Deep Cross-Reference) Örümcek Ağı" kuracaktır.

Aşağıdaki 4 temel mimari kuralı harfiyen uygulayacaksın. Kodda varsayılan (mock/hardcoded) tek bir satır bile veri kabul etmiyorum.

KURAL 1: KUSURSUZ VE ÇİFT YÖNLÜ ÇAPRAZ EŞLEŞTİRME (DEEP CROSS-MATCHING)
Kullanıcı arama motoruna ne yazarsa yazsın (OEM veya Yan Sanayi Referans kodu), günün sonunda o parçanın dünyadaki BÜTÜN kan bağı olan kodları eksiksiz olarak JSON ile dönülecektir. Bu algoritma şu adımlarla çalışmak ZORUNDADIR:

Senaryo A (Referans Kodu Girilirse): Kullanıcı örneğin trw gdb1552 (veya herhangi bir marka kodu) girdiğinde; API önce bu referansın bağlı olduğu "Ana Kök OEM (Base OEM)" numarasını bulacaktır. Ardından durmayacak, bulduğu bu Kök OEM numarası üzerinden veritabanını TEKRAR tarayacak ve bu koda bağlı olan DİĞER TÜM OEM Revizyon kodlarını (farklı yıllardaki OEM numaraları) ve TÜM Yan Sanayi muadillerini (Bosch, Valeo, AYD vb.) eksiksiz bir şekilde toplayacaktır.

Senaryo B (OEM Kodu Girilirse): Kullanıcı örneğin 7701208122 girdiğinde; API bu OEM'in diğer tüm versiyon/revizyon OEM numaralarını ve buna bağlı olan TÜM üreticilerin referans kodlarını çıkaracaktır.

Sonuç: İstek nasıl başlarsa başlasın, çıktı HER ZAMAN devasa ve eksiksiz bir "Eşdeğerler Havuzu" olmalıdır.

KURAL 2: TAVİZVİZ GÖRSEL VE TEKNİK ŞEMA TARAMASI (AGGRESSIVE SCHEMA FETCHING)
Otomotiv endüstrisinde her bir OEM numarasının mutlaka bir teknik şeması veya çizimi vardır. API, kullanıcının girdiği spesifik kodda görsel bulamadı diye (null/empty dönerek) işlemi kestirip atamaz. Şema getirme algoritmasını şu "Acımasız Tarama (Aggressive Fallback)" mantığıyla yazacaksın:

Kullanıcının arattığı kodda (Örn: trw gdb1552) şema çıkmadıysa; Kural 1'de bulduğun "Eşdeğer OEM ve Referans Kodları" dizisinin (array) içine gireceksin.

Arka planda (backend-side) bu dizideki her bir eşdeğer kod için sırayla görsel/şema sorgusu atacaksın.

İçlerinden şeması/fotoğrafı olan İLK orijinal kodun (OEM) şemasını acımasızca çekip alacak ve API'nin ana görsel yanıtı (images array) olarak frontend'e göndereceksin. Gerekirse yanıtın içine schemaSourceCode: '410601241R' şeklinde bu şemanın hangi kardeş koddan çekildiğini belirten bir metadata ekleyeceksin.

KURAL 3: STATİK (SAHTE) VERİYE SIFIR TOLERANS
Katalogdan veya veritabanından dönen verilerde eksiklik olsa dahi, API ASLA uydurma veri, varsayılan metin veya statik "Karter / Yağ Filtresi" gibi çöplük veriler dönmeyecektir.

technicalSpecs objesi sadece ve sadece o parçaya özel (Örn: Balata için kalınlık, kayış için diş sayısı vb.) API'den gelen GERÇEK verilerle dolacaktır.

Eğer bir veri API'den gelmiyorsa, backend o alanı JSON içine hiç dahil etmeyecek (undefined bırakacak), böylece frontend oraya sahte veri basamayacaktır.

KURAL 4: KESİN API JSON ÇIKTI STANDARDI (STRICT PAYLOAD)
Frontend'in bu kusursuz veriyi işleyebilmesi için Search Controller'ın döndüreceği JSON yanıtı kesinlikle şu formatta, zenginleştirilmiş ve ayrıştırılmış olmalıdır:

JSON
{
  "success": true,
  "searchedQuery": "trw gdb1552",
  "rootOEM": "410601241R",
  "originalOEMs": ["7701208122", "410601241R", "..."], 
  "referenceCodes": [
    { "brand": "TRW", "code": "GDB1552" },
    { "brand": "Bosch", "code": "0986424794" },
    { "brand": "AYD", "code": "11-60091AA" }
  ],
  "technicalSpecs": {
    "thickness": "18mm",
    "fittingPosition": "Front Axle"
  },
  "images": [
    { 
      "url": "https://...", 
      "isFallback": true, 
      "sourceCode": "410601241R" 
    }
  ]
}
Bu gereksinimleri Prisma şemana, Fetch/Axios dış API isteklerine ve Controller mantığına eksiksiz yedir. İşlemi tamamla ve kodda yaptığın "Deep Cross-Reference" iterasyonunu bana açıkla.
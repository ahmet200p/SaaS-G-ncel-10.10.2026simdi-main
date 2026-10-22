"Frontend'in 404 alma sebebiyle ilgili harika bir tespitimiz var: Terim uyuşmazlığı yaşıyor olabilir miyiz? Lütfen backend Express.js route dosyanı kontrol et. Rotayı /api/catalog/search-oem (veya article) olarak tanımladıysan, frontend hala search-oe adresine istek attığı için URL'ler eşleşmiyor ve 404 alıyoruz.

Frontend ve Backend tarafındaki istek atılan URL'yi tamamen birbiriyle eşleştir.

Dışarıdaki TradeSoft API'sine giden asıl URL'nin de dokümantasyonda OE mi, OEM mi yoksa Article numarası olarak mı geçtiğini teyit edip axios isteğini tam o kelimeyle güncelle."
/**
 * ============================================================================
 * Multi-Tenant B2B SaaS - Multer Dosya / Görsel Yükleme Ara Yazılımı
 * Dosya: middleware/upload.js
 * ============================================================================
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Uploads dizin yolunu belirle ve yoksa oluştur
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Disk Storage Yapılandırması: Date.now() + '-' + safeName
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Özel karakterleri güvenli alt çizgiye dönüştür
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

// Sadece Resim Formatlarını Kabul Et (image/*)
const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Yalnızca resim formatları (image/*) kabul edilir!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB dosya boyutu sınırı
  }
});

module.exports = upload;

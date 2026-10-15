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

// Sadece Güvenli Resim Formatlarını ve Uzantılarını Kabul Et (Whitelisting)
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  // 1. Güvenli uzantı kontrolü (SVG ve çalıştırılabilir betikler XSS/RCE koruması için engellenir)
  if (!allowedExtensions.has(ext)) {
    return cb(new Error('Yalnızca güvenli resim uzantıları (.jpg, .jpeg, .png, .webp, .gif) kabul edilir!'), false);
  }

  // 2. MIME türü doğrulama
  if (!allowedMimeTypes.has(mime)) {
    return cb(new Error('Yalnızca geçerli resim formatları (JPEG, PNG, WebP, GIF) kabul edilir!'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB dosya boyutu sınırı
  }
});

module.exports = upload;

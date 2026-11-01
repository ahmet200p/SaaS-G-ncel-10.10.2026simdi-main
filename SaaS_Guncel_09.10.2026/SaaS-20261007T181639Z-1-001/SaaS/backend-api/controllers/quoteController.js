// ============================================================================
// Multi-Tenant B2B SaaS - Müşteri Teklifi (CustomerQuote) Kontrolcüsü
// prompt.md: POST /api/quotes/generate -> WhatsApp Paylaşımı ve Benzersiz Link
// ============================================================================

const prisma = require('../lib/prisma');
const crypto = require('crypto');

// Bellek içi fail-safe teklif havuzu
const inMemoryCustomerQuotes = new Map();

/**
 * PGlite yerel gömülü veritabanı örneği (PostgreSQL çevrimdışı fallback)
 */
function getPgliteInstance() {
  try {
    const serverPath = require.resolve('../server');
    if (require.cache[serverPath] && require.cache[serverPath].exports?.pgliteDbInstance) {
      return require.cache[serverPath].exports.pgliteDbInstance;
    }
    const devServerPath = require.resolve('../dev_pg_server');
    if (require.cache[devServerPath] && require.cache[devServerPath].exports?.pgliteDbInstance) {
      return require.cache[devServerPath].exports.pgliteDbInstance;
    }
  } catch (_) {}
  return null;
}

/**
 * Telefon numarasını WhatsApp standardına (905xxxxxxxxx) temizler
 */
function cleanPhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '9' + digits;
  if (digits.length === 10) digits = '90' + digits;
  return digits;
}

/**
 * @desc  Sepet veya Arama Sonuçlarından Müşteri Teklifi Oluşturur
 * @route POST /api/quotes/generate, POST /quotes/generate
 * @access Public / Private (Bayi veya Usta)
 */
async function generateQuote(req, res) {
  try {
    const body = req.body || {};
    const rawCustomerName = body.customerName || body.clientName || body.name || '';
    const customerName = String(rawCustomerName).trim();

    if (!customerName) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen teklif verilecek müşteri veya servis adını belirtiniz.'
      });
    }

    const rawItems = Array.isArray(body.items) ? body.items : (body.cart || body.products || []);
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Teklif oluşturmak için en az bir ürün/parça kalemi gereklidir.'
      });
    }

    // Parça kalemlerini temizle ve formatla
    const cleanItems = rawItems.map((item, idx) => {
      const p = item.product || item;
      const partName = String(p.partName || p.name || item.name || `Parça Kalemi ${idx + 1}`).trim();
      const oemCode = String(p.oemCode || p.oeNumber || item.oeNumber || item.code || '-').trim();
      const quantity = Math.max(1, parseInt(item.quantity || item.qty || 1, 10));
      const unitPrice = parseFloat(item.unitPrice !== undefined ? item.unitPrice : (item.price || p.customPrice || p.defaultPrice || 0));
      const totalPrice = parseFloat((item.totalPrice !== undefined ? item.totalPrice : (unitPrice * quantity)).toFixed(2));

      return {
        partName,
        oemCode,
        quantity,
        unitPrice,
        totalPrice,
        brand: p.vehicleBrand || p.brand || item.brand || undefined,
        category: p.category || item.category || undefined,
        imageUrl: p.imageUrl || item.imageUrl || undefined
      };
    });

    // Toplam fiyatı hesapla
    let calculatedTotal = cleanItems.reduce((acc, curr) => acc + curr.totalPrice, 0);
    if (body.totalPrice !== undefined && !isNaN(parseFloat(body.totalPrice))) {
      calculatedTotal = parseFloat(parseFloat(body.totalPrice).toFixed(2));
    } else {
      calculatedTotal = parseFloat(calculatedTotal.toFixed(2));
    }

    const rawPhone = body.customerPhone || body.phone || body.mobile || '';
    const customerPhone = cleanPhoneNumber(rawPhone) || (rawPhone ? String(rawPhone).trim() : null);
    const userId = req.user?.id || body.userId || null;
    const tenantId = req.tenant?.id || body.tenantId || req.headers['x-tenant-id'] || null;
    const notes = body.notes ? String(body.notes).trim() : null;

    // Teklif geçerlilik süresi (Varsayılan 7 gün)
    const validDays = Math.max(1, parseInt(body.validDays || 7, 10));
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

    const quoteId = crypto.randomUUID();
    let savedQuote = null;

    // 1. Birincil Yol: Prisma Client ile Kayıt
    try {
      savedQuote = await prisma.customerQuote.create({
        data: {
          id: quoteId,
          userId,
          tenantId,
          customerName,
          customerPhone,
          totalPrice: calculatedTotal,
          items: cleanItems,
          notes,
          status: 'ACTIVE',
          validUntil
        }
      });
    } catch (prismaErr) {
      console.warn('[QUOTE_PRISMA_WARN] Prisma bağlantı hatası, PGlite fallback deneniyor:', prismaErr.message);

      // 2. İkincil Yol: PGlite Fallback
      const pglite = getPgliteInstance();
      if (pglite) {
        try {
          const pResult = await pglite.query(
            `INSERT INTO "CustomerQuote" (
              "id", "userId", "tenantId", "customerName", "customerPhone",
              "totalPrice", "items", "notes", "status", "validUntil", "createdAt", "updatedAt"
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING *;`,
            [
              quoteId,
              userId,
              tenantId,
              customerName,
              customerPhone,
              calculatedTotal,
              JSON.stringify(cleanItems),
              notes,
              validUntil.toISOString()
            ]
          );
          if (pResult.rows && pResult.rows.length > 0) {
            savedQuote = pResult.rows[0];
          }
        } catch (pgErr) {
          console.warn('[QUOTE_PGLITE_WARN]:', pgErr.message);
        }
      }

      // 3. Üçüncül Yol: In-Memory Map Fallback
      if (!savedQuote) {
        savedQuote = {
          id: quoteId,
          userId,
          tenantId,
          customerName,
          customerPhone,
          totalPrice: calculatedTotal,
          items: cleanItems,
          notes,
          status: 'ACTIVE',
          validUntil,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        inMemoryCustomerQuotes.set(quoteId, savedQuote);
      }
    }

    // Benzersiz Dış Erişim URL'i ve WhatsApp Paylaşım Metni Üretimi
    const relativeQuoteUrl = `/quote/${quoteId}`;
    const hostHeader = req.headers.host || 'localhost:5000';
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const fullQuoteUrl = `${protocol}://${hostHeader}${relativeQuoteUrl}`;

    const itemsSummary = cleanItems
      .slice(0, 3)
      .map((it) => `• ${it.partName} (${it.quantity} Adet)`)
      .join('\n');
    const moreNotice = cleanItems.length > 3 ? `\n... ve ${cleanItems.length - 3} kalem daha` : '';

    const upperCustomerName = (typeof customerName.toLocaleUpperCase === 'function')
      ? customerName.toLocaleUpperCase('tr-TR')
      : customerName.toUpperCase();

    const whatsappShareText =
      `*SAYIN ${upperCustomerName}, YEDEK PARÇA TEKLİFİNİZ HAZIRLANDI*\n\n` +
      `${itemsSummary}${moreNotice}\n\n` +
      `*Toplam Tutar:* ${calculatedTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL (KDV Dahil)\n\n` +
      `Teklif detaylarını görüntülemek ve teyit etmek için linke tıklayınız:\n${fullQuoteUrl}`;

    const whatsappShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappShareText)}${
      customerPhone ? `&phone=${customerPhone}` : ''
    }`;

    return res.status(201).json({
      success: true,
      message: 'Müşteri teklifi başarıyla oluşturuldu.',
      data: {
        id: quoteId,
        customerName: savedQuote.customerName,
        customerPhone: savedQuote.customerPhone,
        totalPrice: savedQuote.totalPrice,
        itemsCount: cleanItems.length,
        items: cleanItems,
        notes: savedQuote.notes,
        quoteUrl: relativeQuoteUrl,
        publicUrl: relativeQuoteUrl,
        fullQuoteUrl,
        whatsappShareUrl,
        whatsappText: whatsappShareText,
        validUntil: savedQuote.validUntil,
        createdAt: savedQuote.createdAt
      }
    });
  } catch (error) {
    console.error('[GENERATE_QUOTE_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Müşteri teklifi oluşturulurken sunucu hatası meydana geldi.',
      error: error.message
    });
  }
}

/**
 * @desc  Benzersiz UUID ile Teklifi Görüntüler (WhatsApp Dış Erişim Uç Noktası)
 * @route GET /api/quotes/:id, GET /quote/:id, GET /quotes/:id
 * @access Public (Müşteri şifresiz olarak teklifini görüntüleyebilir)
 */
async function getQuoteById(req, res) {
  try {
    const rawId = req.params.id || req.params.uuid || req.query.id;
    const id = String(rawId || '').trim();

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen geçerli bir teklif kimliği (UUID) belirtiniz.'
      });
    }

    let quote = null;

    // 1. Prisma ile ara
    try {
      quote = await prisma.customerQuote.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          },
          tenant: {
            select: { name: true, subdomain: true, themeColor: true }
          }
        }
      });
    } catch (_) {
      // 2. PGlite ile ara
      const pglite = getPgliteInstance();
      if (pglite) {
        try {
          const pResult = await pglite.query(`SELECT * FROM "CustomerQuote" WHERE "id" = $1 LIMIT 1;`, [id]);
          if (pResult.rows && pResult.rows.length > 0) {
            quote = pResult.rows[0];
            if (typeof quote.items === 'string') {
              try { quote.items = JSON.parse(quote.items); } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // 3. In-memory Map kontrolü
      if (!quote && inMemoryCustomerQuotes.has(id)) {
        quote = inMemoryCustomerQuotes.get(id);
      }
    }

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Belirtilen müşteri teklifi bulunamadı veya süresi dolmuş.'
      });
    }

    // Tarayıcıdan doğrudan girildiyse şık kullanıcı arayüzüne yönlendir
    const acceptsHtml = req.accepts && req.accepts('html');
    const acceptsJson = req.accepts && req.accepts('json');
    if (acceptsHtml && (!acceptsJson || req.headers['sec-fetch-dest'] === 'document')) {
      return res.redirect(`/storefront-ui/quote.html?id=${encodeURIComponent(id)}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Müşteri teklifi başarıyla getirildi.',
      data: {
        id: quote.id,
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        totalPrice: quote.totalPrice,
        items: quote.items,
        notes: quote.notes,
        status: quote.status,
        validUntil: quote.validUntil,
        dealerName: quote.tenant?.name || 'Oto Yedek Parça Yetkili Bayi',
        createdAt: quote.createdAt
      }
    });
  } catch (error) {
    console.error('[GET_QUOTE_BY_ID_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Teklif görüntülenirken hata oluştu.'
    });
  }
}

/**
 * @desc  Bayinin veya Ustanın Oluşturduğu Teklifleri Listeler
 * @route GET /api/quotes, GET /quotes
 * @access Private
 */
async function getQuotes(req, res) {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const userId = req.user?.id || req.query.userId || null;
    const tenantId = req.tenant?.id || req.query.tenantId || null;

    let quotes = [];

    try {
      const where = {};
      if (userId) where.userId = userId;
      if (tenantId) where.tenantId = tenantId;

      quotes = await prisma.customerQuote.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' }
      });
    } catch (_) {
      const pglite = getPgliteInstance();
      if (pglite) {
        try {
          const pResult = await pglite.query(
            `SELECT * FROM "CustomerQuote" ORDER BY "createdAt" DESC LIMIT $1;`,
            [limit]
          );
          quotes = pResult.rows || [];
        } catch (_) {}
      }

      if (quotes.length === 0 && inMemoryCustomerQuotes.size > 0) {
        quotes = Array.from(inMemoryCustomerQuotes.values()).slice(0, limit);
      }
    }

    return res.status(200).json({
      success: true,
      count: quotes.length,
      data: quotes
    });
  } catch (error) {
    console.error('[LIST_QUOTES_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Teklifler listelenemedi.'
    });
  }
}

module.exports = {
  generateQuote,
  getQuoteById,
  getQuotes,
  cleanPhoneNumber
};

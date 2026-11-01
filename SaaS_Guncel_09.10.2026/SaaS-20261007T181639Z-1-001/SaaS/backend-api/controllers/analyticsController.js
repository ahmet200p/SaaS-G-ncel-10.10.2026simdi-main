// ============================================================================
// Multi-Tenant B2B SaaS - Analitik ve Büyüme (Growth) Kontrolcüsü
// prompt.md: Kayıp Arama (No-Hit Log) Yönetimi
// ============================================================================

const prisma = require('../lib/prisma');
const crypto = require('crypto');

// Çalışma zamanı in-memory yedekleme havuzu (DB bağlantısı kesilirse sıfır veri kaybı)
const inMemoryNoHitLogs = [];

/**
 * PGlite yerel gömülü veritabanı örneğine erişim sağlar (Fail-safe fallback)
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
  } catch (_) { }
  return null;
}

/**
 * Arama tipini standartlaştırır: 'VIN', 'OEM', 'KEYWORD'
 */
function normalizeSearchType(rawType = '', searchTerm = '') {
  const t = String(rawType || '').trim().toUpperCase();
  if (t === 'VIN' || t === 'ŞASI' || t === 'SASI' || /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(searchTerm)) {
    return 'VIN';
  }
  if (t === 'OE' || t === 'OEM' || t === 'CODE' || t === 'PART_CODE') {
    return 'OEM';
  }
  return 'KEYWORD';
}

/**
 * @desc  Kayıp Arama (No-Hit) Kaydı Oluşturur
 * @route POST /api/analytics/no-hit, POST /analytics/no-hit
 * @access Public (Sessiz mod - Frontend'den arama sonucu 0 olduğunda tetiklenir)
 */
async function recordNoHitLog(req, res) {
  try {
    const body = req.body || {};
    const rawSearchTerm = body.searchTerm || body.term || body.query || body.q || req.query.searchTerm || req.query.q || '';
    const searchTerm = String(rawSearchTerm).trim();

    // Boş aramalar sessizce başarılı sayılır
    if (!searchTerm) {
      return res.status(200).json({
        success: true,
        message: 'Boş arama terimi atlandı.'
      });
    }

    const searchType = normalizeSearchType(body.searchType || body.type, searchTerm);
    const userId = req.user?.id || body.userId || null;
    const tenantId = req.tenant?.id || body.tenantId || req.headers['x-tenant-id'] || null;

    const metadata = {
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
      category: body.category || null,
      brand: body.brand || null,
      source: body.source || 'storefront',
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {})
    };

    let savedLog = null;

    // 1. Birincil Yol: Prisma Client ile Kayıt
    try {
      savedLog = await prisma.noHitLog.create({
        data: {
          searchTerm,
          searchType,
          userId,
          tenantId,
          metadata
        }
      });
    } catch (prismaErr) {
      // 2. İkincil Yol: PGlite Fallback
      const pglite = getPgliteInstance();
      if (pglite) {
        try {
          const generatedId = crypto.randomUUID();
          const pResult = await pglite.query(
            `INSERT INTO "NoHitLog" ("id", "searchTerm", "searchType", "userId", "tenantId", "metadata", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             RETURNING *;`,
            [generatedId, searchTerm, searchType, userId, tenantId, JSON.stringify(metadata)]
          );
          if (pResult.rows && pResult.rows.length > 0) {
            savedLog = pResult.rows[0];
          }
        } catch (_) { }
      }

      // 3. Üçüncül Yol: Bellek İçi Kuyruk
      if (!savedLog) {
        savedLog = {
          id: 'nohit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          searchTerm,
          searchType,
          userId,
          tenantId,
          metadata,
          createdAt: new Date()
        };
        inMemoryNoHitLogs.unshift(savedLog);
        if (inMemoryNoHitLogs.length > 1000) inMemoryNoHitLogs.pop();
      }
    }

    // prompt.md Kuralı: Bayi arayüzünü kesintiye uğratmadan sessizce 200 OK dön
    return res.status(200).json({
      success: true,
      message: 'Kayıp arama günlüğe başarıyla kaydedildi.',
      logId: savedLog?.id || null
    });
  } catch (err) {
    // Sessiz mod: Hata olsa dahi 200 OK dönerek arama deneyimini koru
    console.warn('[NO_HIT_LOG_WARN]:', err.message);
    return res.status(200).json({
      success: true,
      message: 'Kayıp arama işlendi (sessiz mod).'
    });
  }
}

/**
 * @desc  Kayıp Arama Günlüklerini Listele & Analiz Et
 * @route GET /api/analytics/no-hit, GET /analytics/no-hit
 * @access Private (Bayi / Süper Admin / Raporlama)
 */
async function getNoHitLogs(req, res) {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const searchType = req.query.searchType ? String(req.query.searchType).toUpperCase() : null;
    const tenantId = req.tenant?.id || req.query.tenantId || null;

    let logs = [];

    // 1. Prisma ile sorgula
    try {
      const where = {};
      if (searchType) where.searchType = searchType;
      if (tenantId) where.tenantId = tenantId;

      logs = await prisma.noHitLog.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true }
          }
        }
      });
    } catch (prismaErr) {
      // 2. PGlite ile sorgula
      const pglite = getPgliteInstance();
      if (pglite) {
        try {
          const conditions = [];
          const params = [];
          if (searchType) {
            params.push(searchType);
            conditions.push(`"searchType" = $${params.length}`);
          }
          if (tenantId) {
            params.push(tenantId);
            conditions.push(`"tenantId" = $${params.length}`);
          }
          const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
          params.push(limit);
          const pResult = await pglite.query(
            `SELECT * FROM "NoHitLog" ${whereClause} ORDER BY "createdAt" DESC LIMIT $${params.length};`,
            params
          );
          logs = pResult.rows || [];
        } catch (_) { }
      }

      // 3. Bellek içi kayıtları birleştir
      if (logs.length === 0 && inMemoryNoHitLogs.length > 0) {
        logs = inMemoryNoHitLogs
          .filter((l) => (!searchType || l.searchType === searchType) && (!tenantId || l.tenantId === tenantId))
          .slice(0, limit);
      }
    }

    // Özet Analitik (Kayıp Satış Fırsatları & Trendler)
    const termCounts = {};
    const typeCounts = { VIN: 0, OEM: 0, KEYWORD: 0 };
    for (const l of logs) {
      const term = l.searchTerm;
      termCounts[term] = (termCounts[term] || 0) + 1;
      const t = l.searchType || 'KEYWORD';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    const topSearches = Object.entries(termCounts)
      .map(([searchTerm, count]) => ({ searchTerm, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
      summary: {
        topLostOpportunities: topSearches,
        bySearchType: typeCounts
      }
    });
  } catch (error) {
    console.error('[GET_NO_HIT_LOGS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Kayıp arama günlükleri getirilemedi.'
    });
  }
}

module.exports = {
  recordNoHitLog,
  getNoHitLogs,
  normalizeSearchType
};

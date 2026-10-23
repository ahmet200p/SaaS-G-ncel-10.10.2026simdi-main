// ============================================================================
// Multi-Tenant B2B SaaS - Bayi Yönetim Denetleyicisi (tenantController.js)
// Konum: backend-api/controllers/tenantController.js
// ============================================================================

const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const { verifyTcKimlikWithNvi } = require('../lib/nviService');

/**
 * Tüm kayıtlı firmaları ve özet istatistiklerini listeler.
 * GET /api/admin/tenants, GET /api/tenants, GET /tenants
 */
async function getAllTenants(req, res) {
  console.log('[TENANT_CONTROLLER] getAllTenants çağrıldı. İstek URL:', req.originalUrl || req.url);

  try {
    let tenants = [];

    // 1. ADIM: Tam ilişkili Prisma sorgusu
    try {
      tenants = await prisma.tenant.findMany({
        include: {
          users: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              status: true,
              createdAt: true
            }
          },
          _count: {
            select: {
              tenantProducts: true,
              customerProfiles: true,
              orders: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      console.log(`[TENANT_CONTROLLER] Tam ilişkili sorgu başarılı. Toplam firma: ${tenants.length}`);
    } catch (fullQueryErr) {
      console.error('[TENANT_FETCH_FULL_QUERY_ERROR] Tam ilişkili Prisma sorgusu başarısız oldu:', fullQueryErr);

      // 2. ADIM: _count olmadan sadece users ilişkisiyle sorgu
      try {
        console.log('[TENANT_CONTROLLER] 2. Aşama: _count olmadan users ilişkili sorgu deneniyor...');
        tenants = await prisma.tenant.findMany({
          include: {
            users: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                createdAt: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        tenants = tenants.map(t => ({
          ...t,
          _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
        }));
        console.log(`[TENANT_CONTROLLER] 2. Aşama başarılı. Toplam firma: ${tenants.length}`);
      } catch (usersQueryErr) {
        console.error('[TENANT_FETCH_USERS_QUERY_ERROR] users ilişkili sorgu başarısız oldu:', usersQueryErr);

        // 3. ADIM: Tamamen ilişkisiz yalın Tenant sorgusu
        try {
          console.log('[TENANT_CONTROLLER] 3. Aşama: İlişkisiz yalın Tenant sorgusu deneniyor...');
          tenants = await prisma.tenant.findMany({
            orderBy: { createdAt: 'desc' }
          });
          tenants = tenants.map(t => ({
            ...t,
            users: [],
            _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
          }));
          console.log(`[TENANT_CONTROLLER] 3. Aşama başarılı. Toplam firma: ${tenants.length}`);
        } catch (rawTenantErr) {
          console.error('[TENANT_FETCH_RAW_PRISMA_ERROR] Prisma Tenant modeli başarısız, Raw SQL fallback deneniyor:', rawTenantErr);

          // 4. ADIM: Doğrudan SQL Fallback (Kusursuz Fail-Safe)
          const rawRows = await prisma.$queryRawUnsafe(`
            SELECT id, name, subdomain, "themeColor", "isActive", 
                   COALESCE(status, 'PENDING') as status, "createdAt", "updatedAt"
            FROM "Tenant" 
            ORDER BY "createdAt" DESC;
          `);
          tenants = (rawRows || []).map(r => ({
            id: r.id,
            name: r.name,
            subdomain: r.subdomain,
            themeColor: r.themeColor || '#2563eb',
            isActive: r.isActive !== false,
            status: r.status || 'PENDING',
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            users: [],
            _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
          }));
          console.log(`[TENANT_CONTROLLER] Raw SQL Fallback başarılı. Toplam firma: ${tenants.length}`);
        }
      }
    }

    // Veri normalizasyonu (Null değerleri ve tip uyuşmazlıklarını temizleme)
    const normalized = (tenants || []).map(t => ({
      id: t.id,
      name: t.name || 'İsimsiz Firma',
      subdomain: t.subdomain || '',
      themeColor: t.themeColor || '#2563eb',
      isActive: t.isActive !== false,
      status: (t.status || 'PENDING').toUpperCase(),
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString(),
      users: Array.isArray(t.users) ? t.users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name || '',
        role: u.role || 'TENANT_ADMIN',
        status: (u.status || 'PENDING').toUpperCase(),
        createdAt: u.createdAt
      })) : [],
      _count: {
        tenantProducts: t._count?.tenantProducts || 0,
        customerProfiles: t._count?.customerProfiles || 0,
        orders: t._count?.orders || 0
      }
    }));

    return res.status(200).json({
      success: true,
      count: normalized.length,
      data: normalized
    });

  } catch (criticalErr) {
    console.error('[CRITICAL_GET_TENANTS_EXCEPTION]:', criticalErr);
    return res.status(500).json({
      success: false,
      message: 'Firmalar listelenirken beklenmeyen bir hata oluştu: ' + criticalErr.message,
      error: process.env.NODE_ENV === 'development' ? criticalErr.message : undefined,
      data: []
    });
  }
}

/**
 * Onay bekleyen bayilerin listesini döner.
 * GET /api/admin/pending-tenants, GET /api/pending-tenants, GET /pending-tenants, GET /api/tenants/pending
 */
async function getPendingTenants(req, res) {
  console.log('[TENANT_CONTROLLER] getPendingTenants çağrıldı. İstek URL:', req.originalUrl || req.url);

  try {
    let pendingTenants = [];

    // 1. ADIM: Tam ilişkili filtreli Prisma sorgusu
    try {
      pendingTenants = await prisma.tenant.findMany({
        where: {
          OR: [
            { status: { in: ['PENDING', 'pending', 'PENDING_APPROVAL'] } },
            { status: null },
            { isActive: false },
            { users: { some: { status: { in: ['PENDING', 'pending', 'PENDING_APPROVAL'] } } } }
          ]
        },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              status: true,
              createdAt: true
            }
          },
          _count: {
            select: {
              tenantProducts: true,
              customerProfiles: true,
              orders: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      console.log(`[TENANT_CONTROLLER] Onay bekleyen tam sorgu başarılı. Kayıt sayısı: ${pendingTenants.length}`);
    } catch (fullPendingErr) {
      console.error('[PENDING_TENANTS_FULL_QUERY_ERROR] Tam filtreli sorgu başarısız:', fullPendingErr);

      // 2. ADIM: _count olmadan basitleştirilmiş filtre
      try {
        console.log('[TENANT_CONTROLLER] 2. Aşama: _count olmadan pending sorgusu deneniyor...');
        pendingTenants = await prisma.tenant.findMany({
          where: {
            OR: [
              { status: { in: ['PENDING', 'pending', 'PENDING_APPROVAL'] } },
              { status: null },
              { isActive: false }
            ]
          },
          include: {
            users: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                createdAt: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        pendingTenants = pendingTenants.map(t => ({
          ...t,
          _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
        }));
        console.log(`[TENANT_CONTROLLER] 2. Aşama pending başarılı. Kayıt sayısı: ${pendingTenants.length}`);
      } catch (simplePendingErr) {
        console.error('[PENDING_TENANTS_SIMPLE_QUERY_ERROR] Basit pending sorgusu başarısız, Raw SQL deneniyor:', simplePendingErr);

        // 3. ADIM: Raw SQL ile doğrudan veritabanından çekme
        const rawRows = await prisma.$queryRawUnsafe(`
          SELECT id, name, subdomain, "themeColor", "isActive", 
                 COALESCE(status, 'PENDING') as status, "createdAt", "updatedAt"
          FROM "Tenant"
          WHERE status IN ('PENDING', 'pending', 'PENDING_APPROVAL') 
             OR status IS NULL 
             OR "isActive" = false
          ORDER BY "createdAt" DESC;
        `);
        pendingTenants = (rawRows || []).map(r => ({
          id: r.id,
          name: r.name,
          subdomain: r.subdomain,
          themeColor: r.themeColor || '#2563eb',
          isActive: r.isActive !== false,
          status: r.status || 'PENDING',
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          users: [],
          _count: { tenantProducts: 0, customerProfiles: 0, orders: 0 }
        }));
        console.log(`[TENANT_CONTROLLER] Raw SQL Pending Fallback başarılı. Kayıt sayısı: ${pendingTenants.length}`);
      }
    }

    // Normalizasyon
    const normalized = (pendingTenants || []).map(t => ({
      id: t.id,
      name: t.name || 'İsimsiz Firma',
      subdomain: t.subdomain || '',
      themeColor: t.themeColor || '#2563eb',
      isActive: t.isActive !== false,
      status: (t.status || 'PENDING').toUpperCase(),
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString(),
      users: Array.isArray(t.users) ? t.users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name || '',
        role: u.role || 'TENANT_ADMIN',
        status: (u.status || 'PENDING').toUpperCase(),
        createdAt: u.createdAt
      })) : [],
      _count: {
        tenantProducts: t._count?.tenantProducts || 0,
        customerProfiles: t._count?.customerProfiles || 0,
        orders: t._count?.orders || 0
      }
    }));

    return res.status(200).json({
      success: true,
      count: normalized.length,
      data: normalized
    });

  } catch (criticalErr) {
    console.error('[CRITICAL_GET_PENDING_TENANTS_EXCEPTION]:', criticalErr);
    return res.status(500).json({
      success: false,
      message: 'Onay bekleyen bayiler listelenirken sunucu hatası oluştu: ' + criticalErr.message,
      error: process.env.NODE_ENV === 'development' ? criticalErr.message : undefined,
      data: []
    });
  }
}

/**
 * Onay bekleyen bayiyi onaylar (status: APPROVED, isActive: true).
 * PUT /api/admin/tenants/:id/approve
 */
async function approveTenant(req, res) {
  try {
    const { id } = req.params;
    console.log(`[TENANT_CONTROLLER] approveTenant çağrıldı. Bayi ID: ${id}`);

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { users: true }
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Onaylanacak bayi bulunamadı.'
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.update({
        where: { id },
        data: {
          status: 'APPROVED',
          isActive: true
        }
      });

      await tx.user.updateMany({
        where: { tenantId: id },
        data: {
          status: 'APPROVED'
        }
      });

      return t;
    });

    console.log(`[TENANT_CONTROLLER] Bayi Onaylandı: "${tenant.name}" (${tenant.subdomain})`);

    return res.status(200).json({
      success: true,
      message: `"${updated.name}" bayisi başarıyla onaylandı ve vitrin yetkileri açıldı.`,
      data: updated
    });
  } catch (error) {
    console.error('[TENANT_APPROVE_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi onaylama işlemi sırasında sunucu hatası oluştu: ' + error.message
    });
  }
}

/**
 * Bayi başvurusunu reddeder (status: REJECTED, isActive: false).
 * PUT /api/admin/tenants/:id/reject
 */
async function rejectTenant(req, res) {
  try {
    const { id } = req.params;
    const reason = req.body?.reason || '';
    console.log(`[TENANT_CONTROLLER] rejectTenant çağrıldı. Bayi ID: ${id}`);

    const tenant = await prisma.tenant.findUnique({
      where: { id }
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Reddedilecek bayi bulunamadı.'
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.update({
        where: { id },
        data: {
          status: 'REJECTED',
          isActive: false
        }
      });

      await tx.user.updateMany({
        where: { tenantId: id },
        data: {
          status: 'REJECTED'
        }
      });

      return t;
    });

    console.log(`[TENANT_CONTROLLER] Bayi Reddedildi: "${tenant.name}" - ${reason || 'Gerekçe belirtilmedi'}`);

    return res.status(200).json({
      success: true,
      message: `"${updated.name}" bayilik başvurusu reddedildi.`,
      data: updated
    });
  } catch (error) {
    console.error('[TENANT_REJECT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi reddetme işlemi sırasında sunucu hatası oluştu: ' + error.message
    });
  }
}

module.exports = {
  getAllTenants,
  getPendingTenants,
  approveTenant,
  rejectTenant
};

// ============================================================================
// B2B AFS Systems - Akıllı Garaj (Smart Garage) Denetleyicisi
// Oto Servis & Usta Sadakat Modülü (controllers/garageController.js)
// ============================================================================

const prisma = require('../lib/prisma');
const path = require('path');
const fs = require('fs');

let pgliteDbInstance = null;
async function getPgliteDb() {
  if (pgliteDbInstance) return pgliteDbInstance;
  try {
    const dbDir = path.join(__dirname, '..', 'prisma', 'pgdata');
    if (fs.existsSync(dbDir)) {
      const { PGlite } = require('@electric-sql/pglite');
      pgliteDbInstance = new PGlite(dbDir);
      try {
        await pgliteDbInstance.exec(`
          ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "vin" TEXT;
          CREATE INDEX IF NOT EXISTS "Order_vin_idx" ON "Order"("vin");
          CREATE TABLE IF NOT EXISTS "GarageVehicle" (
            "id" TEXT PRIMARY KEY,
            "userId" TEXT NOT NULL,
            "vin" TEXT NOT NULL,
            "plate" TEXT,
            "customerName" TEXT,
            "lastServiceDate" TIMESTAMP(3),
            "vehicleBrand" TEXT,
            "model" TEXT,
            "notes" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS "GarageVehicle_userId_idx" ON "GarageVehicle"("userId");
          CREATE INDEX IF NOT EXISTS "GarageVehicle_vin_idx" ON "GarageVehicle"("vin");
        `);
      } catch (_) {}
      return pgliteDbInstance;
    }
  } catch (e) {
    console.warn('[GARAGE_PGLITE_FALLBACK_WARN]:', e.message);
  }
  return null;
}

/**
 * Şasi Numarasını (VIN) standart ve güvenli formata temizler.
 */
function cleanVin(rawVin) {
  if (!rawVin || typeof rawVin !== 'string') return '';
  return rawVin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
}

/**
 * @desc  Akıllı Garaja Araç Kaydet (Tek tıkla VIN aramasından veya formdan)
 * @route POST /api/garage
 * @access Private (Usta / Bayi / Müşteri)
 */
async function createGarageVehicle(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.'
      });
    }

    const {
      vin,
      plate,
      customerName,
      lastServiceDate,
      vehicleBrand,
      model,
      notes
    } = req.body || {};

    const normalizedVin = cleanVin(vin);
    if (!normalizedVin || normalizedVin.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen geçerli bir Şasi (VIN) numarası giriniz (en az 5 karakter).'
      });
    }

    const cleanPlate = plate ? String(plate).trim().toUpperCase() : null;
    const cleanCustomerName = customerName ? String(customerName).trim() : null;
    const cleanBrand = vehicleBrand ? String(vehicleBrand).trim() : null;
    const cleanModel = model ? String(model).trim() : null;
    const cleanNotes = notes ? String(notes).trim() : null;

    let parsedServiceDate = null;
    if (lastServiceDate) {
      const d = new Date(lastServiceDate);
      if (!isNaN(d.getTime())) {
        parsedServiceDate = d;
      }
    }

    let vehicleRecord = null;

    // 1. Prisma ile Kaydet / Güncelle (Upsert mantığı)
    try {
      const existing = await prisma.garageVehicle.findFirst({
        where: {
          userId: userId,
          vin: normalizedVin
        }
      });

      if (existing) {
        vehicleRecord = await prisma.garageVehicle.update({
          where: { id: existing.id },
          data: {
            plate: cleanPlate !== null ? cleanPlate : existing.plate,
            customerName: cleanCustomerName !== null ? cleanCustomerName : existing.customerName,
            lastServiceDate: parsedServiceDate !== null ? parsedServiceDate : existing.lastServiceDate,
            vehicleBrand: cleanBrand !== null ? cleanBrand : existing.vehicleBrand,
            model: cleanModel !== null ? cleanModel : existing.model,
            notes: cleanNotes !== null ? cleanNotes : existing.notes
          }
        });
      } else {
        vehicleRecord = await prisma.garageVehicle.create({
          data: {
            userId: userId,
            vin: normalizedVin,
            plate: cleanPlate,
            customerName: cleanCustomerName,
            lastServiceDate: parsedServiceDate,
            vehicleBrand: cleanBrand,
            model: cleanModel,
            notes: cleanNotes
          }
        });
      }
    } catch (prismaErr) {
      console.warn('[GARAGE_PRISMA_WARN] Prisma bağlantı hatası, PGlite fallback deneniyor:', prismaErr.message);

      // 2. PGlite Doğrudan SQL Fallback
      const pg = await getPgliteDb();
      if (!pg) throw prismaErr;

      const uuid = require('crypto').randomUUID();
      const now = new Date().toISOString();
      const serviceIso = parsedServiceDate ? parsedServiceDate.toISOString() : null;

      // Tablo oluşturulduğundan emin ol
      await pg.exec(`
        CREATE TABLE IF NOT EXISTS "GarageVehicle" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "vin" TEXT NOT NULL,
          "plate" TEXT,
          "customerName" TEXT,
          "lastServiceDate" TIMESTAMP(3),
          "vehicleBrand" TEXT,
          "model" TEXT,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const existingRows = await pg.query(
        `SELECT * FROM "GarageVehicle" WHERE "userId" = $1 AND "vin" = $2 LIMIT 1`,
        [userId, normalizedVin]
      );

      if (existingRows.rows && existingRows.rows.length > 0) {
        const id = existingRows.rows[0].id;
        await pg.query(
          `UPDATE "GarageVehicle" SET
            "plate" = COALESCE($1, "plate"),
            "customerName" = COALESCE($2, "customerName"),
            "lastServiceDate" = COALESCE($3, "lastServiceDate"),
            "vehicleBrand" = COALESCE($4, "vehicleBrand"),
            "model" = COALESCE($5, "model"),
            "notes" = COALESCE($6, "notes"),
            "updatedAt" = $7
          WHERE "id" = $8`,
          [cleanPlate, cleanCustomerName, serviceIso, cleanBrand, cleanModel, cleanNotes, now, id]
        );
        const updated = await pg.query(`SELECT * FROM "GarageVehicle" WHERE "id" = $1`, [id]);
        vehicleRecord = updated.rows[0];
      } else {
        await pg.query(
          `INSERT INTO "GarageVehicle" (
            "id", "userId", "vin", "plate", "customerName", "lastServiceDate", "vehicleBrand", "model", "notes", "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [uuid, userId, normalizedVin, cleanPlate, cleanCustomerName, serviceIso, cleanBrand, cleanModel, cleanNotes, now, now]
        );
        const created = await pg.query(`SELECT * FROM "GarageVehicle" WHERE "id" = $1`, [uuid]);
        vehicleRecord = created.rows[0];
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Araç başarıyla ustanın akıllı garajına kaydedildi.',
      data: vehicleRecord
    });
  } catch (error) {
    console.error('[CREATE_GARAGE_VEHICLE_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Araç akıllı garaja kaydedilirken sunucu hatası oluştu: ' + error.message
    });
  }
}

/**
 * @desc  Ustanın Kaydettiği Tüm Araçları Listele
 * @route GET /api/garage
 * @access Private (Usta / Bayi / Müşteri)
 */
async function getGarageVehicles(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.'
      });
    }

    const searchQuery = (req.query?.q || req.query?.search || '').trim().toLowerCase();

    let vehicles = [];

    try {
      const whereCondition = { userId: userId };
      if (searchQuery) {
        whereCondition.OR = [
          { vin: { contains: searchQuery, mode: 'insensitive' } },
          { plate: { contains: searchQuery, mode: 'insensitive' } },
          { customerName: { contains: searchQuery, mode: 'insensitive' } },
          { vehicleBrand: { contains: searchQuery, mode: 'insensitive' } },
          { model: { contains: searchQuery, mode: 'insensitive' } }
        ];
      }

      vehicles = await prisma.garageVehicle.findMany({
        where: whereCondition,
        orderBy: { updatedAt: 'desc' }
      });
    } catch (prismaErr) {
      console.warn('[GET_GARAGE_PRISMA_WARN] PGlite fallback:', prismaErr.message);
      const pg = await getPgliteDb();
      if (!pg) throw prismaErr;

      let query = `SELECT * FROM "GarageVehicle" WHERE "userId" = $1`;
      const params = [userId];

      if (searchQuery) {
        query += ` AND (
          LOWER("vin") LIKE $2 OR 
          LOWER(COALESCE("plate", '')) LIKE $2 OR 
          LOWER(COALESCE("customerName", '')) LIKE $2 OR
          LOWER(COALESCE("vehicleBrand", '')) LIKE $2 OR
          LOWER(COALESCE("model", '')) LIKE $2
        )`;
        params.push(`%${searchQuery}%`);
      }

      query += ` ORDER BY "updatedAt" DESC`;
      const resQuery = await pg.query(query, params);
      vehicles = resQuery.rows || [];
    }

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles
    });
  } catch (error) {
    console.error('[GET_GARAGE_VEHICLES_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Garaj araçları listelenirken bir hata oluştu: ' + error.message
    });
  }
}

/**
 * @desc  Belirli bir Şasiye (VIN) Geçmişte Bu Usta Tarafından Sipariş Edilen Parçaların Geçmişi
 * @route GET /api/garage/history/:vin
 * @access Private (Usta / Bayi / Müşteri)
 */
async function getGarageVehicleHistory(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.'
      });
    }

    const rawVin = req.params?.vin || req.query?.vin;
    const normalizedVin = cleanVin(rawVin);

    if (!normalizedVin) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen geçmişi sorgulanacak Şasi (VIN) numarasını belirtiniz.'
      });
    }

    let vehicleInfo = null;
    let matchingOrders = [];

    try {
      // 1. Aracın garaj kaydını bul
      vehicleInfo = await prisma.garageVehicle.findFirst({
        where: {
          userId: userId,
          vin: normalizedVin
        }
      });

      // 2. Kullanıcının müşteri profilini (CustomerProfile) bul
      const customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: userId }
      });

      const customerId = customerProfile ? customerProfile.id : null;

      // 3. Bu ustanın siparişlerini filtrele
      // A. Doğrudan vin eşleşen siparişler
      // B. Veya shippingAddress / teslimat notunda bu şasi geçen siparişler
      const orderWhere = {
        OR: [
          { vin: normalizedVin },
          { shippingAddress: { contains: normalizedVin, mode: 'insensitive' } }
        ]
      };

      if (customerId) {
        orderWhere.customerId = customerId;
      } else if (req.user?.tenantId) {
        orderWhere.tenantId = req.user.tenantId;
      }

      matchingOrders = await prisma.order.findMany({
        where: orderWhere,
        include: {
          items: {
            include: {
              tenantProduct: {
                include: {
                  product: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Eğer doğrudan şasi eşleşen sipariş yoksa ancak müşteri profili varsa,
      // müşterinin son siparişleri içinden parça uyumluluğu kontrolü yapabiliriz
      if (matchingOrders.length === 0 && customerId) {
        const recentOrders = await prisma.order.findMany({
          where: { customerId: customerId },
          include: {
            items: {
              include: {
                tenantProduct: {
                  include: {
                    product: true
                  }
                }
              }
            }
          },
          take: 50,
          orderBy: { createdAt: 'desc' }
        });

        // Eğer sipariş açıklamasında veya parçanın uyumlu modellerinde şasi bağlamı varsa ekle
        for (const o of recentOrders) {
          if (o.vin === normalizedVin || (o.shippingAddress && o.shippingAddress.toUpperCase().includes(normalizedVin))) {
            matchingOrders.push(o);
          }
        }
      }
    } catch (prismaErr) {
      console.warn('[GET_GARAGE_HISTORY_PRISMA_WARN] PGlite fallback:', prismaErr.message);
      const pg = await getPgliteDb();
      if (pg) {
        const vRes = await pg.query(
          `SELECT * FROM "GarageVehicle" WHERE "userId" = $1 AND "vin" = $2 LIMIT 1`,
          [userId, normalizedVin]
        );
        vehicleInfo = vRes.rows && vRes.rows[0] ? vRes.rows[0] : null;

        try {
          const oRes = await pg.query(
            `SELECT o.*, 
              json_agg(json_build_object(
                'id', oi.id,
                'quantity', oi.quantity,
                'unitPrice', oi."unitPrice",
                'totalPrice', oi."totalPrice",
                'tenantProduct', json_build_object(
                  'id', tp.id,
                  'product', json_build_object(
                    'id', p.id,
                    'oeNumber', p."oeNumber",
                    'name', p.name,
                    'category', p.category,
                    'partGroup', p."partGroup",
                    'vehicleBrand', p."vehicleBrand"
                  )
                )
              )) as items
            FROM "Order" o
            LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
            LEFT JOIN "TenantProduct" tp ON tp.id = oi."tenantProductId"
            LEFT JOIN "Product" p ON p.id = tp."productId"
            WHERE o."vin" = $1 OR (o."shippingAddress" IS NOT NULL AND o."shippingAddress" ILIKE $2)
            GROUP BY o.id
            ORDER BY o."createdAt" DESC`,
            [normalizedVin, `%${normalizedVin}%`]
          );
          matchingOrders = oRes.rows || [];
        } catch (oErr) {
          console.warn('[GARAGE_HISTORY_ORDERS_WARN]:', oErr.message);
          matchingOrders = [];
        }
      }
    }

    // Parça listesini derle ve düzleştir
    const orderedParts = [];
    for (const order of matchingOrders) {
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const prod = item.tenantProduct?.product;
          orderedParts.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderDate: order.createdAt,
            orderStatus: order.status,
            paymentMethod: order.paymentMethod,
            itemId: item.id,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            oeNumber: prod?.oeNumber || 'BELİRTİLMEDİ',
            partName: prod?.name || 'Yedek Parça',
            category: prod?.category || 'Genel Parça',
            partGroup: prod?.partGroup || null,
            vehicleBrand: prod?.vehicleBrand || null,
            imageUrl: prod?.imageUrl || null
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      vin: normalizedVin,
      vehicle: vehicleInfo || null,
      totalOrders: matchingOrders.length,
      totalParts: orderedParts.length,
      parts: orderedParts,
      orders: matchingOrders,
      data: {
        vin: normalizedVin,
        vehicle: vehicleInfo || null,
        totalOrders: matchingOrders.length,
        totalParts: orderedParts.length,
        parts: orderedParts,
        orders: matchingOrders
      }
    });
  } catch (error) {
    console.error('[GET_GARAGE_VEHICLE_HISTORY_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Şasi sipariş geçmişi sorgulanırken bir hata oluştu: ' + error.message
    });
  }
}

/**
 * @desc  Akıllı Garajdan Araç Sil
 * @route DELETE /api/garage/:id
 * @access Private (Usta / Bayi)
 */
async function deleteGarageVehicle(req, res) {
  try {
    const userId = req.user?.id;
    const vehicleId = req.params?.id;

    if (!userId || !vehicleId) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz istek parametreleri.'
      });
    }

    try {
      await prisma.garageVehicle.deleteMany({
        where: {
          id: vehicleId,
          userId: userId
        }
      });
    } catch (e) {
      const pg = await getPgliteDb();
      if (pg) {
        await pg.query(`DELETE FROM "GarageVehicle" WHERE "id" = $1 AND "userId" = $2`, [vehicleId, userId]);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Araç akıllı garajınızdan başarıyla silindi.'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Araç silinemedi: ' + error.message
    });
  }
}

module.exports = {
  createGarageVehicle,
  getGarageVehicles,
  getGarageVehicleHistory,
  deleteGarageVehicle,
  cleanVin
};

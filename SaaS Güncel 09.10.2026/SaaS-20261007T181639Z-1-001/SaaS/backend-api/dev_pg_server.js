const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const fs = require('fs');
const path = require('path');
const net = require('net');

function isPortOpen(port = 5432, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

let activeServer = null;
let activeDb = null;

async function startServer() {
  const isOpen = await isPortOpen(5432);
  if (isOpen) {
    return { alreadyRunning: true };
  }

  const dbDir = path.join(__dirname, 'prisma', 'pgdata');
  activeDb = new PGlite(dbDir);

  const migrationFile = path.join(__dirname, 'prisma', 'migrations', '20261014180000_init_postgres', 'migration.sql');
  if (fs.existsSync(migrationFile)) {
    try {
      const sql = fs.readFileSync(migrationFile, 'utf8');
      await activeDb.exec(sql);
    } catch (e) {
      // Tablolar zaten mevcutsa hatayı yut
    }
  }

  try {
    await activeDb.exec(`
      ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
      ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "apiKeyHash" TEXT;
      ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PENDING';
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PENDING';
      ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "crossReferences" JSONB;
      ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "compatibleVehicles" JSONB;
      ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "attributes" JSONB;
      ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "diagramUrl" TEXT;
      ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "diagrams" JSONB;
    `);
  } catch (e) {}

  activeServer = new PGLiteSocketServer({
    db: activeDb,
    port: 5432,
    host: '127.0.0.1',
    maxConnections: 100
  });
  await activeServer.start();
  console.log('🐘 Local PostgreSQL Server running on 127.0.0.1:5432');

  const shutdown = async () => {
    if (activeServer) {
      await activeServer.stop();
      activeServer = null;
    }
    if (activeDb) {
      await activeDb.close();
      activeDb = null;
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { alreadyRunning: false, server: activeServer, db: activeDb };
}

if (require.main === module) {
  startServer().catch(console.error);
}

module.exports = { startServer, isPortOpen };

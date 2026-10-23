const prisma = require('../backend-api/lib/prisma');

async function searchGlobal() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND data_type IN ('text', 'character varying');
  `);

  console.log(`Searching across ${result.length} columns in public schema...`);

  for (const col of result) {
    try {
      const rows = await prisma.$queryRawUnsafe(`
        SELECT "${col.column_name}" as val FROM "${col.table_name}"
        WHERE "${col.column_name}"::text ILIKE '%arda%' OR "${col.column_name}"::text LIKE '%1111111111%'
        LIMIT 5;
      `);
      if (rows && rows.length > 0) {
        console.log(`FOUND IN ${col.table_name}.${col.column_name}:`, rows);
      }
    } catch (e) {
      // ignore
    }
  }

  await prisma.$disconnect();
}

searchGlobal().catch(console.error);

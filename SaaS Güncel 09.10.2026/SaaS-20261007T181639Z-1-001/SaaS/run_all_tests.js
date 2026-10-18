const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const { startServer } = require('./backend-api/dev_pg_server');

async function main() {
  await startServer();

  const testFiles = fs.readdirSync(__dirname)
    .filter(f => f.startsWith('test_') && f.endsWith('.js') && f !== 'run_all_tests.js')
    .sort();

  console.log(`Found ${testFiles.length} test files to run.\n`);

  let passed = 0;
  let failed = 0;
  const failedFiles = [];

  for (const file of testFiles) {
  process.stdout.write(`▶ Running: ${file} ... `);
  const start = Date.now();
  const res = spawnSync('node', [file], {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 30000
  });

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  if (res.status === 0) {
    console.log(`✅ PASS (${duration}s)`);
    passed++;
  } else {
    console.log(`❌ FAIL (code ${res.status}, ${duration}s)`);
    failed++;
    failedFiles.push({ file, output: res.stdout + '\n' + res.stderr });
  }
}

console.log(`\n========================================`);
console.log(`Summary: ${passed} PASSED, ${failed} FAILED (Total ${testFiles.length})`);
console.log(`========================================`);

  if (failed > 0) {
    console.log('\nFailed Tests Details:');
    for (const f of failedFiles) {
      console.log(`\n--- [${f.file}] ---`);
      console.log(f.output.slice(-1000));
    }
    process.exit(1);
  } else {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function fixture(t, contents) {
  const root = mkdtempSync(path.join(tmpdir(), 'mfu-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'backend-node'));
  mkdirSync(path.join(root, 'unrelated-cwd'));
  copyFileSync(path.join(__dirname, '../config.js'), path.join(root, 'backend-node/config.js'));
  if (contents !== undefined) writeFileSync(path.join(root, '.env'), contents);
  return root;
}

function readConfig(root, overrides = {}) {
  const env = { ...process.env, NODE_PATH: path.join(__dirname, '../node_modules') };
  for (const key of Object.keys(env)) {
    if (/^(GPS_|SUPABASE_|ADMIN_)/.test(key) || ['PORT', 'MONGO_URI', 'DB_NAME', 'SECRET_KEY'].includes(key)) delete env[key];
  }
  const script = `
    const config = require(${JSON.stringify(path.join(root, 'backend-node/config.js'))});
    console.log(JSON.stringify({
      db: config.DB_NAME, port: config.PORT, gps: config.GPS,
      supabase: process.env.SUPABASE_SECRET_KEY,
      admin: process.env.ADMIN_PASSWORD
    }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(root, 'unrelated-cwd'), env: { ...env, ...overrides }, encoding: 'utf8',
  }));
}

test('API, seeds and diagnostics receive root settings regardless of cwd', t => {
  const root = fixture(t, [
    'DB_NAME=config_test', 'PORT=5199', 'GPS_ENABLED=false',
    'GPS_USERNAME=test-user', 'GPS_PASSWORD="test#password"', 'GPS_POLL_SECONDS=8',
    'SUPABASE_SECRET_KEY=test-publisher-secret', 'ADMIN_PASSWORD=test-admin-password',
  ].join('\n'));
  writeFileSync(path.join(root, 'backend-node/.env.gps'), 'GPS_USERNAME=obsolete');
  const config = readConfig(root);
  assert.equal(config.db, 'config_test');
  assert.equal(config.port, 5199);
  assert.equal(config.gps.enabled, false);
  assert.equal(config.gps.username, 'test-user');
  assert.equal(config.gps.password, 'test#password');
  assert.equal(config.gps.pollMs, 8000);
  assert.equal(config.supabase, 'test-publisher-secret');
  assert.equal(config.admin, 'test-admin-password');
});

test('shell and Docker environment take precedence over root settings', t => {
  const root = fixture(t, 'DB_NAME=file_db\nGPS_ENABLED=true\nGPS_USERNAME=file-user');
  const config = readConfig(root, { DB_NAME: 'shell_db', GPS_ENABLED: 'false', GPS_USERNAME: 'shell-user' });
  assert.equal(config.db, 'shell_db');
  assert.equal(config.gps.enabled, false);
  assert.equal(config.gps.username, 'shell-user');
});

test('containers can use supplied environment without an env file in the image', t => {
  const config = readConfig(fixture(t), { DB_NAME: 'container_db', GPS_USERNAME: 'container-user' });
  assert.equal(config.db, 'container_db');
  assert.equal(config.gps.username, 'container-user');
  assert.equal(config.port, 5101);
});

/**
 * Supabase / Prisma Connection Diagnostic Test
 * Run with: node test-conn.js
 *
 * Tests:
 *  1. Env var presence & URL sanity
 *  2. TCP port reachability (5432 + 6543)
 *  3. DNS resolution
 *  4. Raw pg driver (DATABASE_URL)
 *  5. Prisma query (DATABASE_URL)
 *  6. Prisma query (DIRECT_URL)
 */

require('dotenv').config();
const net = require('net');
const dns = require('dns').promises;
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');

// ── colours ──────────────────────────────────────────────────────────────────
const OK   = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✘\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';

function section(title) {
  console.log(`\n${'─'.repeat(60)}\n ${title}\n${'─'.repeat(60)}`);
}

function parseDbUrl(raw) {
  try {
    const clean = raw.replace(/[?&]pgbouncer=\w+/g, '');
    const u = new URL(clean);
    return { host: u.hostname, port: parseInt(u.port || '5432'), valid: true };
  } catch { return { valid: false }; }
}

// TCP probe with explicit timeout
function tcpProbe(host, port, timeoutMs = 7000) {
  return new Promise(resolve => {
    const s = new net.Socket();
    let done = false;
    const finish = (result) => { if (!done) { done = true; s.destroy(); resolve(result); } };
    s.setTimeout(timeoutMs);
    s.connect(port, host);
    s.on('connect', () => finish('OPEN'));
    s.on('timeout', () => finish('TIMEOUT'));
    s.on('error', (e) => finish(`ERROR: ${e.message}`));
  });
}

// Raw pg test — strips sslmode from URL to avoid pg v8 verify-full override
async function testRawPg(label, connectionString) {
  const cleanUrl = connectionString
    .replace(/[?&]sslmode=\w+/g, '')
    .replace(/[?&]connect_timeout=\d+/g, '')
    .replace(/[?&]pgbouncer=\w+/g, '');
  const client = new Client({
    connectionString: cleanUrl,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
  });
  const t0 = Date.now();
  try {
    await client.connect();
    const { rows } = await client.query('SELECT NOW() AS now');
    console.log(`  ${OK} ${label} → ${Date.now() - t0}ms | server time: ${rows[0].now}`);
    await client.end();
    return true;
  } catch (err) {
    console.log(`  ${FAIL} ${label} → ${Date.now() - t0}ms | ${err.message}`);
    try { await client.end(); } catch {}
    return false;
  }
}

// Prisma test with explicit URL injection
async function testPrisma(label, url) {
  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const t0 = Date.now();
  try {
    const r = await prisma.$queryRaw`SELECT 1+1 AS two`;
    console.log(`  ${OK} Prisma [${label}] → ${Date.now() - t0}ms | result: ${JSON.stringify(r)}`);
    await prisma.$disconnect();
    return true;
  } catch (err) {
    console.log(`  ${FAIL} Prisma [${label}] → ${Date.now() - t0}ms`);
    console.log(`      code: ${err.code ?? 'N/A'} | ${err.message?.split('\n')[0]}`);
    try { await prisma.$disconnect(); } catch {}
    return false;
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🔍  Supabase Connection Diagnostic — ' + new Date().toISOString());

  // ── 1. Env vars ────────────────────────────────────────────────────────────
  section('1. Environment Variables');
  const DATABASE_URL = process.env.DATABASE_URL;
  const DIRECT_URL   = process.env.DIRECT_URL;

  if (!DATABASE_URL) { console.log(`  ${FAIL} DATABASE_URL missing`); process.exit(1); }
  console.log(`  ${OK} DATABASE_URL set`);
  console.log(DIRECT_URL ? `  ${OK} DIRECT_URL set` : `  ${WARN} DIRECT_URL not set (Prisma will use DATABASE_URL for migrations)`);

  const dbP  = parseDbUrl(DATABASE_URL);
  const dirP = DIRECT_URL ? parseDbUrl(DIRECT_URL) : null;

  if (dbP.valid)  console.log(`      DATABASE_URL → ${dbP.host}:${dbP.port}${dbP.port !== 6543 ? ' ⚠ expected 6543' : ''}`);
  if (dirP?.valid) console.log(`      DIRECT_URL   → ${dirP.host}:${dirP.port}${dirP.port !== 5432 ? ' ⚠ expected 5432 for migrations' : ''}`);

  // ── 2. DNS ─────────────────────────────────────────────────────────────────
  section('2. DNS Resolution');
  const host = dbP.valid ? dbP.host : 'aws-1-ap-south-1.pooler.supabase.com';
  try {
    const v4 = await dns.resolve4(host);
    console.log(`  ${OK} IPv4 → ${v4.join(', ')}`);
  } catch {
    try {
      const v6 = await dns.resolve6(host);
      console.log(`  ${WARN} IPv6 only → ${v6[0]} (may cause P1001 on IPv4 networks)`);
    } catch (e) {
      console.log(`  ${FAIL} DNS failed: ${e.message}`);
    }
  }

  // ── 3. TCP probe ───────────────────────────────────────────────────────────
  section('3. TCP Port Reachability');
  const [r6543, r5432] = await Promise.all([
    tcpProbe(host, 6543),
    tcpProbe(host, 5432),
  ]);
  console.log(`  ${r6543 === 'OPEN' ? OK : FAIL} Port 6543 (runtime pooler)   → ${r6543}`);
  console.log(`  ${r5432 === 'OPEN' ? OK : FAIL} Port 5432 (migration/direct) → ${r5432}`);

  if (r5432 !== 'OPEN') {
    console.log(`\n  ${WARN} Port 5432 is NOT reachable. This is why npx prisma db push fails.`);
    console.log(`      Possible causes:`);
    console.log(`       • Supabase project is paused (open supabase.com and check)`);
    console.log(`       • Your ISP/router blocks outbound port 5432`);
    console.log(`       • Network firewall — try a hotspot or VPN`);
  }

  // ── 4. Raw pg (runtime URL only) ───────────────────────────────────────────
  section('4. Raw pg Driver (DATABASE_URL)');
  await testRawPg('port 6543', DATABASE_URL);

  // ── 5. Prisma runtime ──────────────────────────────────────────────────────
  section('5. Prisma Client Tests');
  const p1 = await testPrisma('DATABASE_URL', DATABASE_URL);
  const p2 = DIRECT_URL ? await testPrisma('DIRECT_URL', DIRECT_URL) : null;

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  section('6. Summary & Recommendation');
  const port5432Ok = r5432 === 'OPEN';
  const port6543Ok = r6543 === 'OPEN';

  if (p1 && port6543Ok && port5432Ok) {
    console.log(`  ${OK} Everything is healthy! Run: npx prisma db push`);
  } else if (p1 && port6543Ok && !port5432Ok) {
    console.log(`  ${WARN} Runtime queries work, but db push will fail.`);
    console.log(`      ${INFO} Port 5432 is blocked on your network.`);
    console.log(`\n  FIX OPTIONS (choose one):`);
    console.log(`   A) Connect to a mobile hotspot and retry db push`);
    console.log(`   B) Use a VPN and retry db push`);
    console.log(`   C) Check supabase.com — if project is paused, resume it and retry`);
    console.log(`   D) Check your router/ISP settings for port 5432 blocking`);
  } else if (!p1) {
    console.log(`  ${FAIL} Runtime queries failing — check your DATABASE_URL and Supabase project status.`);
  }
  console.log('');
  process.exit(0);
})();

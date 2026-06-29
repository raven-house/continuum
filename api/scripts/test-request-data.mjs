/**
 * Fast (no-chain) test for the /request_data migration flow.
 *
 * Seeds fake `MigrationRegistered` + `Transfer` events straight into Mongo (the
 * shape the indexer would produce), then calls the LIVE API over HTTP and checks
 * that the right tokens are attested. This exercises everything off-chain that
 * the migration depends on — commitment resolution, latest-Transfer.to ownership,
 * the third-party / transferred-away filtering, and Schnorr signing — without
 * deploying contracts, bridging fee juice, or waiting on the indexer.
 *
 * Prereqs: Mongo running + API running (with the current code) on :3004.
 *
 * Run:
 *   cd api && node scripts/test-request-data.mjs
 *
 * Env:
 *   CONTINUUM_API_URL  (default http://localhost:3004)
 *   MONGO_URL          (default mongodb://root:password@localhost:27017)
 *   CONTINUUM_DB_NAME  (default continuum)
 */

import { MongoClient } from 'mongodb';

const API_URL = (process.env.CONTINUUM_API_URL ?? 'http://localhost:3004').replace(/\/$/, '');
const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://root:password@localhost:27017';
const DB_NAME = process.env.CONTINUUM_DB_NAME ?? 'continuum';

// A marker so we only ever touch docs this test created.
const TAG = 'e2e-request-data-test';

// Deterministic fake addresses as small in-field values (0x + 64 hex, < BN254
// modulus so signMigrationClaim's Fr.fromHexString accepts them).
const addr = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const ALICE_OLD = addr(11);
const ALICE_NEW = addr(22);
const OTHER = addr(33);
const OLD_COL = addr(44);
const NEW_COL = addr(55);

// The indexer decodes Field values to bigint and stores them as DECIMAL strings
// (e.g. "101"), so seed the same way to mirror real indexed data.
const tokenDec = (n) => String(n);

function transfer(tokenId, to, block) {
  return {
    _e2e: TAG,
    artifact_id: 'nft',
    event_type: 'Transfer',
    block_number: block,
    contract_address: OLD_COL,
    data: { from: addr(99), to, token_id: tokenDec(tokenId) }
  };
}

async function main() {
  // 1. Secret + commitment (computed by the API, exactly as registration would).
  const secret = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(31)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  const commitRes = await fetch(`${API_URL}/migration/commitment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret })
  });
  if (!commitRes.ok) throw new Error(`/migration/commitment → ${commitRes.status} ${await commitRes.text()}`);
  const { commitment } = await commitRes.json();

  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db(DB_NAME);
  const events = db.collection('events');
  const registry = db.collection('collection_registry');

  try {
    // 2. Clean any leftovers from a previous run.
    await events.deleteMany({ _e2e: TAG });
    await registry.deleteMany({ _e2e: TAG });

    // 3. Seed the old→new mapping.
    await registry.insertOne({
      _e2e: TAG,
      old_collection_address: OLD_COL,
      old_network: 'sandbox',
      new_collection_address: NEW_COL,
      new_network: 'sandbox',
      collection_name: 'Request-Data Test'
    });

    // 4. Seed the on-chain registration (verified owner = ALICE_OLD).
    await events.insertOne({
      _e2e: TAG,
      artifact_id: 'nft',
      event_type: 'MigrationRegistered',
      block_number: 1,
      contract_address: OLD_COL,
      // indexer stores the commitment Field as a decimal string
      data: { owner: ALICE_OLD, migration_commitment: BigInt(commitment).toString() }
    });

    // 5. Seed Transfers. Expected result: tokens whose LATEST owner is ALICE_OLD.
    //    101 → Alice                          (included)
    //    102 → Alice, then away to OTHER      (excluded: latest owner is OTHER)
    //    103 → OTHER, then back to Alice       (included: latest owner is Alice)
    //    999 → OTHER                           (excluded: never Alice's)
    await events.insertMany([
      transfer(101, ALICE_OLD, 2),
      transfer(102, ALICE_OLD, 2),
      transfer(102, OTHER, 5),
      transfer(103, OTHER, 3),
      transfer(103, ALICE_OLD, 6),
      transfer(999, OTHER, 4)
    ]);

    // 6. Call the live endpoint.
    const res = await fetch(`${API_URL}/request_data`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection_address: NEW_COL,
        migration_secret: secret,
        new_wallet_address: ALICE_NEW
      })
    });
    if (!res.ok) throw new Error(`/request_data → ${res.status} ${await res.text()}`);
    const body = await res.json();

    // 7. Assertions.
    const got = (body.tokens ?? []).map((t) => Number(BigInt(t.token_id))).sort((a, b) => a - b);
    const expected = [101, 103];

    const checks = [];
    const assert = (cond, msg) => checks.push({ ok: !!cond, msg });

    assert(body.old_wallet_address?.toLowerCase() === ALICE_OLD,
      `resolved owner is ALICE_OLD (got ${body.old_wallet_address})`);
    assert(JSON.stringify(got) === JSON.stringify(expected),
      `attested tokens = [${expected}] (got [${got}])`);
    assert(!got.includes(102), 'token 102 (transferred away) excluded');
    assert(!got.includes(999), "token 999 (someone else's) excluded");
    assert((body.tokens ?? []).every((t) => Array.isArray(t.signature_bytes) && t.signature_bytes.length === 64),
      'every token carries a 64-byte signature');

    const failed = checks.filter((c) => !c.ok);
    for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.msg}`);

    if (failed.length) {
      console.error(`\n✗ FAIL — ${failed.length} check(s) failed`);
      process.exitCode = 1;
    } else {
      console.log('\n✓ PASS — /request_data selects and signs the correct tokens');
    }
  } finally {
    // 8. Always clean up.
    await events.deleteMany({ _e2e: TAG });
    await registry.deleteMany({ _e2e: TAG });
    await client.close();
  }
}

main().catch((err) => {
  console.error('\nTest error:', err);
  process.exit(1);
});

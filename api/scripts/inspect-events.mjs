/**
 * Inspect what the indexer has written to Mongo.
 *
 * Shows sync progress per network/artifact, registered artifacts, event counts,
 * and recent events — the quickest way to see why /request_data can't find data.
 *
 * Run:
 *   cd api && node scripts/inspect-events.mjs
 *   cd api && node scripts/inspect-events.mjs MigrationRegistered      # filter by event type
 *   cd api && node scripts/inspect-events.mjs Transfer 0xabc...        # + filter by contract
 *
 * Env: MONGO_URL (default mongodb://root:password@localhost:27017), CONTINUUM_DB_NAME (default continuum)
 */

import { MongoClient } from 'mongodb';

const [eventType, contractAddress] = process.argv.slice(2);
const url = process.env.MONGO_URL ?? 'mongodb://root:password@localhost:27017';
const dbName = process.env.CONTINUUM_DB_NAME ?? 'continuum';

const client = await MongoClient.connect(url);
const db = client.db(dbName);

const j = (x) => JSON.stringify(x, null, 1);

console.log('\n── sync_state (how far each network/artifact has indexed) ──');
console.log(j(await db.collection('sync_state').find().toArray()));

console.log('\n── contracts (registered artifacts) ──');
console.log(
  j(
    await db
      .collection('contracts')
      .find({}, { projection: { artifact_id: 1, contractName: 1, enabled: 1, event_types: 1, start_block: 1, _id: 0 } })
      .toArray()
  )
);

console.log('\n── events: counts by type ──');
console.log(j(await db.collection('events').aggregate([{ $group: { _id: '$event_type', n: { $sum: 1 } } }]).toArray()));

const filter = {};
if (eventType) filter.event_type = eventType;
if (contractAddress) filter.contract_address = contractAddress.toLowerCase();

console.log(`\n── events: latest 10 ${eventType ? `(${eventType}${contractAddress ? ' @ ' + contractAddress : ''})` : '(any)'} ──`);
console.log(
  j(
    await db
      .collection('events')
      .find(filter, { projection: { event_type: 1, block_number: 1, contract_address: 1, data: 1, _id: 0 } })
      .sort({ block_number: -1 })
      .limit(10)
      .toArray()
  )
);

console.log('\n── collection_registry ──');
console.log(j(await db.collection('collection_registry').find({}, { projection: { _id: 0 } }).toArray()));

await client.close();

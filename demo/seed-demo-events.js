#!/usr/bin/env bun
/**
 * Seed demo NFT events into MongoDB to simulate "old rollup" state.
 *
 * Inserts 3 NFTTransfer mint events for DEMO_ADDRESS — as if that address
 * held 3 NFTs on the old rollup. The Continuum API will read these events
 * and return a signed attestation for amount=3.
 *
 * Usage:
 *   DEMO_ADDRESS=0x27b6f... bun run demo/seed-demo-events.js
 *
 * Required env vars:
 *   DEMO_ADDRESS              - Aztec address to seed events for (0x-prefixed hex)
 *
 * Optional env vars:
 *   MONGODB_URL               - MongoDB connection string (default: mongodb://root:password@localhost:27017)
 *   CONTINUUM_DB_NAME         - Database name (default: continuum)
 *   NFT_CONTRACT_ADDRESS      - NFT contract address to attribute events to (default: 0x + "ab"*32)
 *   CONTINUUM_NFT_ARTIFACT_ID - Artifact ID (default: example-nft)
 */

import { MongoClient } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://root:password@localhost:27017';
const DB_NAME = process.env.CONTINUUM_DB_NAME ?? 'continuum';
const ARTIFACT_ID = process.env.CONTINUUM_NFT_ARTIFACT_ID ?? 'example-nft';
const EVENTS_COLLECTION = 'events';

// Aztec zero address (32 bytes, not 20)
const ZERO_ADDRESS = '0x' + '0'.repeat(64);

const demoAddress = process.env.DEMO_ADDRESS;
if (!demoAddress) {
  console.error('Error: DEMO_ADDRESS env var is required');
  console.error('Example: DEMO_ADDRESS=0x27b6f... bun run demo/seed-demo-events.js');
  process.exit(1);
}

// A fake NFT contract address on the "old rollup"
const nftContract =
  process.env.NFT_CONTRACT_ADDRESS ?? '0x' + 'ab'.repeat(32);

const normalizedAddress = demoAddress.toLowerCase();
const now = Math.floor(Date.now() / 1000);

// 3 mint events: from = zero address, to = demo address, token_id = 1/2/3
const events = [1, 2, 3].map((tokenId) => ({
  artifact_id: ARTIFACT_ID,
  event_type: 'NFTTransfer',
  block_number: 1000 + tokenId,
  contract_address: nftContract.toLowerCase(),
  data: {
    from: ZERO_ADDRESS,
    to: normalizedAddress,
    token_id: `0x${tokenId.toString(16).padStart(64, '0')}`,
  },
  timestamp: now - (3 - tokenId) * 60,
  indexed_at: new Date(),
}));

const client = new MongoClient(MONGODB_URL);
await client.connect();

const db = client.db(DB_NAME);
const col = db.collection(EVENTS_COLLECTION);

// Upsert so re-running the script is idempotent
const ops = events.map((event) => ({
  updateOne: {
    filter: {
      artifact_id: event.artifact_id,
      event_type: event.event_type,
      block_number: event.block_number,
      contract_address: event.contract_address,
      'data.token_id': event.data.token_id,
    },
    update: { $set: event },
    upsert: true,
  },
}));

const result = await col.bulkWrite(ops);
console.log(`Seeded ${result.upsertedCount} new + ${result.modifiedCount} updated NFTTransfer events`);
console.log(`Demo address: ${normalizedAddress}`);
console.log(`NFT contract: ${nftContract.toLowerCase()}`);
console.log(`\nExpected API response: { amount: 3, ... }`);

await client.close();

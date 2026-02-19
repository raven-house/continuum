import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.RH_DB_CONNECTION_STRING);

console.log('Connecting to database');

await client.connect();

const db = client.db(process.env.RH_DB_NAME);

console.log('################ CREATE COLLECTIONS SANDBOX START ##############');

console.log('Creating `indexed_blocks` collection');

let collection = await db.createCollection('indexed_blocks');
await collection.createIndex({ id: 1 }, { unique: true });

console.log('Done');

console.log(`Creating 'listing_created' collection`);
collection = await db.createCollection('listing_created');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({ timestamp: 1 });
console.log('Done');

console.log(`Creating 'listing_sold' collection`);
collection = await db.createCollection('listing_sold');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ buyer: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({ timestamp: 1 });
await collection.createIndex({ price: 1 });
console.log('Done');

console.log(`Creating 'listing_cancelled' collection`);
collection = await db.createCollection('listing_cancelled');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ timestamp: 1 });
console.log('Done');

console.log(`Creating 'nft_transfer' collection`);
collection = await db.createCollection('nft_transfer');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ from: 1 });
await collection.createIndex({ to: 1 });
await collection.createIndex({ collection_address: 1 });

console.log(`Creating 'offer_created' collection`);
collection = await db.createCollection('offer_created');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });
console.log('Done');

console.log(`Creating 'offer_accepted' collection`);
collection = await db.createCollection('offer_accepted');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });
console.log('Done');

console.log(`Creating 'offer_cancelled' collection`);
collection = await db.createCollection('offer_cancelled');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });
console.log('Done');

console.log(`Creating 'voucher_claimed' collection`);
collection = await db.createCollection('voucher_claimed');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ claimer: 1 });
await collection.createIndex({ amount: 1 });
await collection.createIndex({ collection_address: 1 });
console.log('Done');

console.log(`Creating 'metadata_update' collection`);
collection = await db.createCollection('metadata_update');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ owner: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({
  collection_address: 1,
  token_id: 1,
  blockNumber: -1
});
await collection.createIndex({ owner: 1, blockNumber: -1 });

console.log(`Creating 'collection_stats' collection`);
collection = await db.createCollection('collection_stats');
await collection.createIndex({ contract_address: 1 }, { unique: true });
await collection.createIndex({ volume: -1 });
console.log('Done');

console.log(`Creating 'collection_stats_history' collection`);
collection = await db.createCollection('collection_stats_history');
await collection.createIndex({ contract_address: 1, timestamp: -1 });
await collection.createIndex({ timestamp: -1 });
// TTL index to automatically delete records older than 30 days
await collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
console.log('Done');

console.log('Done');

console.log('################ CREATE COLLECTIONS SANDBOX END ##############');

console.log('################ CREATE COLLECTIONS TESTNET START ##############');

console.log(`Creating 'listing_created_testnet' collection`);
collection = await db.createCollection('listing_created_testnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({ timestamp: 1 });

console.log(`Creating 'listing_sold_testnet' collection`);
collection = await db.createCollection('listing_sold_testnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ buyer: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({ timestamp: 1 });
await collection.createIndex({ price: 1 });

console.log(`Creating 'listing_cancelled_testnet' collection`);
collection = await db.createCollection('listing_cancelled_testnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ timestamp: 1 });

console.log(`Creating 'nft_transfer_testnet' collection`);
collection = await db.createCollection('nft_transfer_testnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ from: 1 });
await collection.createIndex({ to: 1 });
await collection.createIndex({ collection_address: 1 });

console.log(`Creating 'offer_created_testnet' collection`);
collection = await db.createCollection('offer_created_testnet');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });

console.log(`Creating 'offer_accepted_testnet' collection`);
collection = await db.createCollection('offer_accepted_testnet');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });

console.log(`Creating 'offer_cancelled_testnet' collection`);
collection = await db.createCollection('offer_cancelled_testnet');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });

console.log(`Creating 'voucher_claimed_testnet' collection`);
collection = await db.createCollection('voucher_claimed_testnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ claimer: 1 });
await collection.createIndex({ amount: 1 });
await collection.createIndex({ collection_address: 1 });

console.log(`Creating 'metadata_update_testnet' collection`);
collection = await db.createCollection('metadata_update_testnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ owner: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({
  collection_address: 1,
  token_id: 1,
  blockNumber: -1
});
await collection.createIndex({ owner: 1, blockNumber: -1 });

console.log(`Creating 'collection_stats_testnet' collection`);
collection = await db.createCollection('collection_stats_testnet');
await collection.createIndex({ contract_address: 1 }, { unique: true });
await collection.createIndex({ volume: -1 });

console.log(`Creating 'collection_stats_history_testnet' collection`);
collection = await db.createCollection('collection_stats_history_testnet');
await collection.createIndex({ contract_address: 1, timestamp: -1 });
await collection.createIndex({ timestamp: -1 });
await collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
console.log('Done');

console.log('################ CREATE COLLECTIONS TESTNET END ##############');

console.log('################ CREATE COLLECTIONS DEVNET START ##############');

console.log(`Creating 'listing_created_devnet' collection`);
collection = await db.createCollection('listing_created_devnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({ timestamp: 1 });

console.log(`Creating 'listing_sold_devnet' collection`);
collection = await db.createCollection('listing_sold_devnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ buyer: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({ timestamp: 1 });
await collection.createIndex({ price: 1 });

console.log(`Creating 'listing_cancelled_devnet' collection`);
collection = await db.createCollection('listing_cancelled_devnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ seller: 1 });
await collection.createIndex({ timestamp: 1 });

console.log(`Creating 'nft_transfer_devnet' collection`);
collection = await db.createCollection('nft_transfer_devnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ from: 1 });
await collection.createIndex({ to: 1 });
await collection.createIndex({ collection_address: 1 });

console.log(`Creating 'offer_created_devnet' collection`);
collection = await db.createCollection('offer_created_devnet');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });

console.log(`Creating 'offer_accepted_devnet' collection`);
collection = await db.createCollection('offer_accepted_devnet');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });

console.log(`Creating 'offer_cancelled_devnet' collection`);
collection = await db.createCollection('offer_cancelled_devnet');
await collection.createIndex({ offer_id: 1 });
await collection.createIndex({ nft_contract: 1 });
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ buyer: 1 });

console.log(`Creating 'voucher_claimed_devnet' collection`);
collection = await db.createCollection('voucher_claimed_devnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ claimer: 1 });
await collection.createIndex({ amount: 1 });
await collection.createIndex({ collection_address: 1 });

console.log(`Creating 'metadata_update_devnet' collection`);
collection = await db.createCollection('metadata_update_devnet');
await collection.createIndex({ token_id: 1 });
await collection.createIndex({ owner: 1 });
await collection.createIndex({ collection_address: 1 });
await collection.createIndex({
  collection_address: 1,
  token_id: 1,
  blockNumber: -1
});
await collection.createIndex({ owner: 1, blockNumber: -1 });

console.log(`Creating 'collection_stats_devnet' collection`);
collection = await db.createCollection('collection_stats_devnet');
await collection.createIndex({ contract_address: 1 }, { unique: true });
await collection.createIndex({ volume: -1 });

console.log(`Creating 'collection_stats_history_devnet' collection`);
collection = await db.createCollection('collection_stats_history_devnet');
await collection.createIndex({ contract_address: 1, timestamp: -1 });
await collection.createIndex({ timestamp: -1 });
await collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
console.log('Done');

console.log('################ CREATE COLLECTIONS DEVNET END ##############');

await client.close();

console.log('Connection closed');

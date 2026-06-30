// MongoDB Initialization Script
// This script runs when MongoDB container is first created

const db = db.getSiblingDB('continuum');

// Create collections
db.createCollection('events');
db.createCollection('sync_state');
db.createCollection('artifacts');
db.createCollection('contracts');
db.createCollection('collection_registry');

// Create indexes for events collection
db.events.createIndex({ artifact_id: 1, event_type: 1, block_number: -1 });
db.events.createIndex({ block_number: 1 });
db.events.createIndex({ artifact_address: 1, block_number: -1 });
db.events.createIndex({ tx_hash: 1 });
db.events.createIndex({ timestamp: -1 });
db.events.createIndex({ created_at: 1 });

// Create indexes for sync_state collection
db.sync_state.createIndex({ artifact_id: 1 }, { unique: true });
db.sync_state.createIndex({ network: 1 });
db.sync_state.createIndex({ is_syncing: 1 });

// Create indexes for artifacts collection
db.artifacts.createIndex({ id: 1 }, { unique: true });
db.artifacts.createIndex({ address: 1 });
db.artifacts.createIndex({ enabled: 1 });

// Create indexes for contracts collection (ABI upload)
db.contracts.createIndex({ contractName: 1 });
db.contracts.createIndex({ createdAt: -1 });
db.contracts.createIndex({ 'events.eventSelector': 1 });
db.contracts.createIndex({ 'events.name': 1 });

// Create indexes for collection_registry (old → new collection address mapping)
db.collection_registry.createIndex(
  { new_collection_address: 1 },
  { unique: true }
);
db.collection_registry.createIndex({ old_collection_address: 1 });
db.collection_registry.createIndex({ new_network: 1 });


console.log('Continuum database initialized successfully!');
console.log(
  'Created collections: events, sync_state, artifacts, contracts, collection_registry'
);
console.log('Created indexes for optimal query performance');

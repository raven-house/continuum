// MongoDB Initialization Script
// This script runs when MongoDB container is first created

db = db.getSiblingDB('continuum');

// Create collections
db.createCollection('events');
db.createCollection('sync_state');
db.createCollection('artifacts');

// Create indexes for events collection
db.events.createIndex({ "artifact_id": 1, "event_type": 1, "block_number": -1 });
db.events.createIndex({ "block_number": 1 });
db.events.createIndex({ "artifact_address": 1, "block_number": -1 });
db.events.createIndex({ "tx_hash": 1 });
db.events.createIndex({ "timestamp": -1 });
db.events.createIndex({ "created_at": 1 });

// Create indexes for sync_state collection
db.sync_state.createIndex({ "artifact_id": 1 }, { unique: true });
db.sync_state.createIndex({ "network": 1 });
db.sync_state.createIndex({ "is_syncing": 1 });

// Create indexes for artifacts collection
db.artifacts.createIndex({ "id": 1 }, { unique: true });
db.artifacts.createIndex({ "address": 1 });
db.artifacts.createIndex({ "enabled": 1 });

// Insert sample artifact configuration (disabled by default)
db.artifacts.insertOne({
  id: "example-artifact",
  name: "Example Contract",
  description: "Example artifact configuration - replace with your own",
  artifact_path: "./artifacts/Example.json",
  addresses: {
    devnet: "",
    testnet: "",
    sandbox: ""
  },
  enabled: false,
  event_types: [],
  start_block: {
    devnet: 0,
    testnet: 0,
    sandbox: 0
  },
  created_at: new Date()
});

print('Continuum database initialized successfully!');
print('Created collections: events, sync_state, artifacts');
print('Created indexes for optimal query performance');

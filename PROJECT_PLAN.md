# Continuum - App State Migration Service

## Project Overview

**Continuum** is an app state migration service that allows projects to migrate public and private state from an old rollup to a new rollup. It indexes events from Aztec contracts on the old rollup and exposes them via a REST API for migration attestation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTINUUM                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────────┐  │
│  │  Database   │    │  Functions  │    │           API                   │  │
│  │  (MongoDB)  │◄───│  (Indexer)  │◄───│   (Fastify REST Server)         │  │
│  │             │    │             │    │                                 │  │
│  │ • Events    │    │ • Cron Jobs │    │ • GET /events/:contract         │  │
│  │ • Metadata  │    │ • Aztec     │    │ • GET /artifacts                │  │
│  │ • SyncState │    │   Node Client   │    │ • GET /sync-state               │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────────────┘  │
│         ▲                                              │                    │
│         │                                              │                    │
│         └──────────────────────────────────────────────┘                    │
│                          JSON Responses                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     AZTEC OLD ROLLUP                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │ Contract 1  │  │ Contract 2  │  │ Contract N  │                  │   │
│  │  │  Events     │  │  Events     │  │  Events     │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
continuum/
├── README.md                 # Project documentation
├── PROJECT_PLAN.md           # This document
├── docker-compose.yml        # Local development setup
│
├── database/                 # MongoDB initialization scripts
│   ├── index.js             # DB setup and indexes
│   └── package.json
│
├── functions/               # Event indexer (cron jobs)
│   ├── index.ts            # Main entry point - cron scheduler
│   ├── package.json
│   ├── config/
│   │   └── index.ts        # Network configurations
│   ├── shared/
│   │   ├── mongodb.ts      # MongoDB connection
│   │   ├── aztecNode.ts    # Aztec node client
│   │   ├── eventDecoder.ts # Event decoding utilities
│   │   ├── logger.ts       # Winston logger
│   │   └── DataStore.ts    # Base DataStore class
│   ├── lib/
│   │   ├── index.ts        # Main indexer handler
│   │   ├── EventIndexer.ts # Generic event indexer
│   │   └── ArtifactRegistry.ts # Contract artifact management
│   └── types/
│       └── index.ts        # TypeScript types
│
├── api/                     # Fastify REST API
│   ├── app.js              # Fastify app entry
│   ├── package.json
│   ├── plugins/
│   │   ├── mongodb.js      # MongoDB plugin
│   │   ├── env.js          # Environment config
│   │   └── cors.js         # CORS configuration
│   ├── routes/
│   │   ├── health/
│   │   │   └── index.js    # Health check endpoint
│   │   ├── events/
│   │   │   └── index.js    # Events API endpoints
│   │   ├── artifacts/
│   │   │   └── index.js    # Artifact management endpoints
│   │   └── sync/
│   │       └── index.js    # Sync state endpoints
│   └── shared/
│       └── schemas.js      # JSON schemas for validation
│
└── artifacts/              # Contract artifacts directory
    └── (user-provided artifacts)
```

## Component Details

### 1. Database Layer (MongoDB)

**Purpose**: Store indexed events and sync state

**Collections**:

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `events` | Store all decoded events | `artifact_id`, `event_type`, `block_number`, `tx_hash`, `data` |
| `sync_state` | Track last indexed block per artifact | `artifact_id`, `last_block_number`, `network` |
| `artifacts` | Contract artifact metadata | `artifact_id`, `name`, `address`, `events[]`, `enabled` |

**Indexes**:
- `events`: `{ artifact_id: 1, event_type: 1, block_number: -1 }`
- `events`: `{ block_number: 1 }` for range queries
- `sync_state`: `{ artifact_id: 1 }` unique
- `artifacts`: `{ address: 1 }`

### 2. Functions Layer (Event Indexer)

**Purpose**: Periodically fetch and index events from Aztec nodes

**Key Components**:

#### `EventIndexer.ts`
Generic indexer that:
1. Loads artifact configuration
2. Fetches new blocks from Aztec node
3. Decodes events using artifact's `events()` method
4. Stores events in MongoDB
5. Updates sync state

#### `ArtifactRegistry.ts`
Manages contract artifacts:
1. Loads artifacts from filesystem
2. Extracts event definitions from `events()` method
3. Provides artifact lookup by ID or address

#### Cron Job Flow
```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Cron Trigger │────▶│ Load Artifacts   │────▶│ For each artifact│
│  (every N sec)│     │ from registry    │     │                 │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                              ┌───────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │ Get last indexed │
                    │ block from DB    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Fetch new blocks │
                    │ from Aztec node  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Decode events    │
                    │ using artifact   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Store events     │
                    │ Update sync state│
                    └──────────────────┘
```

### 3. API Layer (Fastify)

**Purpose**: Expose indexed events via REST API

**Endpoints**:

#### Health
- `GET /health` - Service health check

#### Events
- `GET /events/:artifact_id` - Get all events for an artifact
  - Query params: `event_type`, `from_block`, `to_block`, `page`, `limit`
- `GET /events/:artifact_id/:event_type` - Get specific event type
  - Query params: `from_block`, `to_block`, `page`, `limit`

#### Artifacts
- `GET /artifacts` - List all registered artifacts
- `GET /artifacts/:artifact_id` - Get artifact details
- `POST /artifacts` - Register new artifact (admin)
- `PUT /artifacts/:artifact_id` - Update artifact (admin)
- `DELETE /artifacts/:artifact_id` - Disable artifact (admin)

#### Sync State
- `GET /sync/:artifact_id` - Get sync status for artifact
- `GET /sync` - Get sync status for all artifacts

## Event Schema

### Stored Event Document
```typescript
{
  _id: ObjectId,
  artifact_id: string,           // Reference to artifact
  artifact_address: string,      // Contract address
  event_type: string,            // Event name (e.g., "Transfer")
  event_selector: string,        // Aztec event selector
  block_number: number,
  block_hash: string,
  tx_hash: string,
  tx_index: number,
  log_index: number,
  timestamp: number,             // Unix timestamp
  data: {                        // Decoded event data
    [fieldName: string]: any
  },
  raw_log: {                     // Raw log data for verification
    fields: string[],
    contract_address: string
  },
  created_at: Date
}
```

### Sync State Document
```typescript
{
  _id: ObjectId,
  artifact_id: string,           // Unique identifier for artifact
  network: string,               // Network name (devnet, testnet, mainnet)
  last_block_number: number,     // Last successfully indexed block
  last_block_hash: string,       // For verification
  last_indexed_at: Date,         // When last indexed
  is_syncing: boolean,           // Currently indexing flag
  error_count: number,           // Consecutive errors
  error_message: string,         // Last error message
  updated_at: Date
}
```

## Configuration

### Environment Variables

```bash
# Database
CONTINUUM_DB_CONNECTION_STRING=mongodb://root:password@localhost:27017
CONTINUUM_DB_NAME=continuum

# Indexer
CONTINUUM_INDEXER_INTERVAL=30000           # Milliseconds between indexing runs
CONTINUUM_INDEXER_BLOCK_RANGE=14           # Blocks to process per batch
CONTINUUM_INDEXER_MAX_RETRIES=3            # Retry attempts on failure

# Aztec Node URLs (can specify multiple networks)
CONTINUUM_AZTEC_NODE_URL_DEVNET=https://devnet.aztec.network
CONTINUUM_AZTEC_NODE_URL_TESTNET=https://testnet.aztec.network

# API
CONTINUUM_API_PORT=3000
CONTINUUM_API_HOST=0.0.0.0
CONTINUUM_CORS_ORIGIN=*

# Artifacts
CONTINUUM_ARTIFACTS_PATH=./artifacts       # Path to contract artifacts
```

### Artifact Configuration File

```json
{
  "artifacts": [
    {
      "id": "nft-contract-v1",
      "name": "NFT Contract",
      "description": "Main NFT collection contract",
      "artifact_path": "./artifacts/NFT.json",
      "addresses": {
        "devnet": "0x...",
        "testnet": "0x..."
      },
      "enabled": true,
      "event_types": ["Transfer", "Approval", "Mint"],
      "start_block": {
        "devnet": 1000,
        "testnet": 5000
      }
    }
  ]
}
```

## Usage Flow

### For Project Developers

1. **Add Events to Contract**
   ```rust
   // In your Aztec contract
   #[event]
   struct Transfer {
       from: AztecAddress,
       to: AztecAddress,
       token_id: Field,
   }
   ```

2. **Generate Artifact**
   ```bash
   aztec-cli compile
   # Generates artifact JSON with events() method
   ```

3. **Configure Continuum**
   - Place artifact in `artifacts/` directory
   - Add entry to `artifacts.json` config
   - Set contract address for target network

4. **Run Continuum**
   ```bash
   # Start MongoDB
   docker-compose up -d mongodb
   
   # Start indexer
   cd functions && npm run start
   
   # Start API
   cd api && npm run start
   ```

5. **Query Events**
   ```bash
   curl http://localhost:3000/events/nft-contract-v1?from_block=1000
   ```

### For Migration Attestation (Future)

1. Query events from Continuum API
2. Generate ZK proof of state
3. Submit attestation to new rollup
4. New rollup verifies and mints equivalent state

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Database schema and connection
- [ ] Configuration system
- [ ] Base DataStore class
- [ ] Logger setup

### Phase 2: Event Indexer
- [ ] Aztec node client integration
- [ ] Event decoding utilities
- [ ] Generic EventIndexer class
- [ ] ArtifactRegistry for loading artifacts
- [ ] Cron job scheduler
- [ ] Error handling and retry logic

### Phase 3: REST API
- [ ] Fastify server setup
- [ ] MongoDB plugin
- [ ] Events endpoints
- [ ] Artifacts endpoints
- [ ] Sync state endpoints
- [ ] Request validation schemas

### Phase 4: Polish & Deployment
- [ ] Docker Compose setup
- [ ] Environment configuration
- [ ] Logging and monitoring
- [ ] Documentation
- [ ] Example artifacts

### Phase 5: Attestation (Future)
- [ ] ZK proof generation integration
- [ ] Attestation verification contract
- [ ] Migration helper utilities

## Key Design Decisions

### 1. Generic Event Storage
- Events stored as flexible JSON documents
- Schema validation on read, not write
- Supports any Aztec contract events

### 2. Per-Artifact Sync State
- Each contract artifact tracks its own last indexed block
- Allows independent indexing progress
- Handles different deployment times

### 3. Artifact-Based Configuration
- Users configure artifacts, not individual events
- Artifact's `events()` method provides event definitions
- Single source of truth for event schema

### 4. Network-Specific Addresses
- Each artifact can have different addresses per network
- Same artifact works across devnet/testnet/mainnet
- Configuration-driven network switching

## Reusing from Existing Codebase

### Keep (Boilerplate)
- `functions/shared/mongodb.ts` - MongoDB singleton connection
- `functions/shared/DataStore.ts` - Base DataStore class
- `functions/shared/aztecNode.ts` - Aztec node client caching
- `functions/shared/getPublicEvents.ts` - Event decoding logic
- `functions/index.ts` - Cron job structure
- `api/plugins/*.js` - Fastify plugins
- `api/app.js` - Fastify app structure

### Modify
- `functions/lib/index.ts` - Replace NFT-specific logic with generic indexer
- `functions/lib/*Store.ts` - Replace with generic EventStore
- `api/routes/*` - Replace NFT routes with generic event routes

### Remove
- NFT-specific event handlers
- Marketplace-specific logic
- Hardcoded contract imports

## API Response Examples

### Get Events
```json
// GET /events/nft-contract-v1?event_type=Transfer&limit=2
{
  "data": [
    {
      "artifact_id": "nft-contract-v1",
      "artifact_address": "0x1234...",
      "event_type": "Transfer",
      "event_selector": "0x54e38003",
      "block_number": 1500,
      "block_hash": "0xabcd...",
      "tx_hash": "0xdef0...",
      "timestamp": 1704067200,
      "data": {
        "from": "0xaaaa...",
        "to": "0xbbbb...",
        "token_id": "42"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 2,
    "total": 150,
    "has_more": true
  }
}
```

### Get Sync State
```json
// GET /sync/nft-contract-v1
{
  "artifact_id": "nft-contract-v1",
  "network": "devnet",
  "last_block_number": 2500,
  "last_indexed_at": "2024-01-01T12:00:00Z",
  "is_syncing": false,
  "pending_blocks": 15
}
```

## Error Handling

### Indexer Errors
- Log error with context
- Increment error counter in sync state
- Retry with exponential backoff
- Pause indexing after max retries

### API Errors
```json
{
  "error": {
    "code": "ARTIFACT_NOT_FOUND",
    "message": "Artifact 'invalid-id' not found",
    "details": { "artifact_id": "invalid-id" }
  }
}
```

## Future Enhancements

1. **WebSocket Support** - Real-time event streaming
2. **GraphQL API** - Flexible querying
3. **Event Filtering** - Advanced query language
4. **Multi-Chain Support** - Index multiple rollups
5. **Caching Layer** - Redis for hot data
6. **Metrics** - Prometheus/Grafana monitoring

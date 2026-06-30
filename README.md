# Continuum

Continuum solves one of the hardest problems in rollup development: **how do users carry their state forward when aztec rollup upgrades**

# What Problem Continuum Solves

When an Aztec L2 rollup migrates to a new version, all on-chain state is reset. Users who held NFTs, tokens, or other assets on the old rollup need a way to prove those holdings and recreate them on the new rollup — without trusting any single party and without requiring access to the old rollup's private data.

Continuum provides a cryptographic bridge between old and new rollup state using:

- An event indexer that reads public events from the old rollup
- An attester service that signs user state claims with a Schnorr key
- A Noir smart contract on the new rollup that verifies those signatures and records the migration



## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│  MongoDB    │◄───│   Indexer   │◄───│  Fastify API    │
│  (Events,   │    │  (Cron Jobs)│    │  (REST Server)  │
│   SyncState,│    │             │    │  :3004          │
│   Migration)│    │             │    │                 │
└─────────────┘    └─────────────┘    └─────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Aztec Old Node │
                   │  (Event Source) │
                   └─────────────────┘
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- (Optional) Bun or Node.js for local development

### Running with Docker Compose

1. **Clone the repository**

   ```bash
   git clone git@github.com:raven-house/continuum.git
   cd continuum
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start all services**

   ```bash
   docker compose up -d
   ```

   This starts:
   - MongoDB on port 27017
   - Event Indexer (background service)
   - REST API on port 3004

4. **Register contracts for indexing**

   Upload each Aztec contract ABI through the API. The API extracts event
   selectors and stores the indexing configuration in MongoDB for the indexer.

   ```bash
   curl -X POST http://localhost:3004/contracts/upload \
     -H "Content-Type: application/json" \
     -d '{
       "artifact_id": "my-contract",
       "name": "My Contract",
       "abi": { /* Noir ABI JSON */ },
       "enabled": true,
       "event_types": ["Transfer", "Mint"],
       "start_block": {
         "devnet": 1000,
         "testnet": 5000,
         "sandbox": 0
       }
     }'
   ```

   Omit `event_types` or pass an empty array to index all events in the ABI.

5. **Check service status**

   ```bash
   docker compose ps
   ```

6. **View logs**

   ```bash
   # All services
   docker compose logs -f

   # Specific service
   docker compose logs -f indexer
   docker compose logs -f api
   docker compose logs -f mongodb
   ```

7. **Stop services**

   ```bash
   docker compose down
   ```

   To also remove the MongoDB volume (WARNING: deletes all data):

   ```bash
   docker compose down -v
   ```

## Development

### Live Reload (no rebuild on code changes)

`docker-compose.yml` is the default local development stack. It mounts the source files as volumes so changes are reflected without rebuilding.

```bash
# First time — build images to bake in dependencies
docker compose up -d --build

# After any code change — just restart, no rebuild
docker compose up -d

# Only rebuild when adding/removing npm packages
docker compose up -d --build
```

### Production deploy

In production, explicitly use the production compose file so self-contained built images are used and source code is not mounted from the host:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## API Endpoints

All endpoints are on port **3004**.

### Health Check

```bash
curl http://localhost:3004/health
```

### Get Events

```bash
# Get all events for an artifact
curl http://localhost:3004/events/my-contract

# Get specific event type
curl http://localhost:3004/events/my-contract/Transfer

# With pagination and block range
curl "http://localhost:3004/events/my-contract?event_type=Transfer&from_block=1000&to_block=2000&page=1&limit=100"
```

### Get Sync Status

```bash
# Get sync status for all artifacts
curl http://localhost:3004/sync

# Get sync status for specific artifact
curl http://localhost:3004/sync/my-contract
```

### Contract ABI Upload

```bash
# Upload contract ABI and extract events with selectors
curl -X POST http://localhost:3004/contracts/upload \
  -H "Content-Type: application/json" \
  -d '{
    "artifact_id": "my-contract",
    "name": "MyContract",
    "abi": { /* Noir ABI JSON */ },
    "enabled": true,
    "event_types": ["Transfer"],
    "start_block": {
      "testnet": 5000,
      "sandbox": 0
    }
  }'

# List all uploaded contracts
curl "http://localhost:3004/contracts?page=1&limit=10"

# Get specific contract by ID
curl http://localhost:3004/contracts/<contract-id>

# Find event by selector
curl http://localhost:3004/contracts/event/0x12345678
```

### Migration Keys

Migration keys let users prove ownership of their old-rollup wallet when Aztec upgrades to a new rollup. Each wallet gets one key, stored securely in MongoDB.

```bash
# Register (or retrieve) a migration key for a wallet
curl -X POST http://localhost:3004/migration/register \
  -H "Content-Type: application/json" \
  -d '{ "walletAddress": "0x...", "network": "devnet" }'

# Check if a wallet has a key (key is masked in response)
curl http://localhost:3004/migration/0x...

# Verify a secret key → resolve to wallet address (used during new-rollup migration)
curl -X POST http://localhost:3004/migration/verify \
  -H "Content-Type: application/json" \
  -d '{ "secretKey": "<64-char hex key>" }'
```

## Project Structure

```
continuum/
├── docker-compose.yml           # Local development Docker Compose (default)
├── docker-compose.prod.yml      # Production Docker Compose
├── .env.example                 # Environment variables template
│
├── database/                    # MongoDB initialization
│   └── init.js                  # Collections, indexes, sample data
│
├── indexer/                     # Event indexer
│   ├── Dockerfile               # Indexer container
│   ├── index.ts                 # Scheduler entry point
│   ├── lib/                     # Indexer logic (EventIndexer, ArtifactRegistry)
│   └── shared/                  # Shared utilities (aztecNode, mongodb, utils)
│
├── api/                         # REST API server (Fastify, port 3004)
│   ├── Dockerfile               # API container
│   ├── app.js                   # Fastify app entry
│   ├── routes/                  # Route handlers
│   │   ├── health/
│   │   ├── contracts/
│   │   ├── listings/
│   │   └── migration/           # Migration key endpoints
│   └── plugins/                 # Fastify plugins (mongodb, cors, env)
```

## Configuration

### Environment Variables

| Variable                           | Description                 | Default                                   |
| ---------------------------------- | --------------------------- | ----------------------------------------- |
| `MONGO_ROOT_USERNAME`              | MongoDB root username       | `root`                                    |
| `MONGO_ROOT_PASSWORD`              | MongoDB root password       | `password`                                |
| `CONTINUUM_DB_CONNECTION_STRING`   | MongoDB connection string   | `mongodb://root:password@localhost:27017` |
| `CONTINUUM_DB_NAME`                | Database name               | `continuum`                               |
| `CONTINUUM_INDEXER_INTERVAL`       | Indexer run interval (ms)   | `30000`                                   |
| `CONTINUUM_INDEXER_BLOCK_RANGE`    | Blocks per batch            | `14`                                      |
| `CONTINUUM_AZTEC_NODE_URL_DEVNET`  | Aztec node URL for devnet   | -                                         |
| `CONTINUUM_AZTEC_NODE_URL_TESTNET` | Aztec node URL for testnet  | -                                         |
| `CONTINUUM_AZTEC_NODE_URL_SANDBOX` | Aztec node URL for sandbox  | `http://sandbox:8080`                     |
| `CONTINUUM_API_PORT`               | API server port             | `3004`                                    |

### Contract Indexing Configuration

Contract indexing configuration is stored in MongoDB when an ABI is uploaded to
`POST /contracts/upload`. The request supports:

- `artifact_id`: Unique identifier used by events and sync state
- `abi`: Noir contract ABI JSON
- `name`: Optional human-readable contract name
- `enabled`: Whether the indexer should index this contract
- `event_types`: Event names to index; omit or leave empty to index all events
- `start_block`: Block to start indexing from per network

## Database Collections

| Collection       | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `events`         | All indexed contract events                          |
| `sync_state`     | Last indexed block per artifact per network          |
| `contracts`      | Uploaded contract ABIs, extracted events, and indexer configuration |
| `migration_keys` | Wallet → secret key mappings for rollup migration    |

See `database/init.js` for the full schema and indexes. Collections and indexes are created automatically when MongoDB first initializes.

## Troubleshooting

### MongoDB Connection Issues

```bash
# Check MongoDB is running
docker compose ps mongodb

# Check MongoDB logs
docker compose logs mongodb

# Connect to MongoDB shell
docker compose exec mongodb mongosh -u root -p password
```

### Indexer Not Processing Events

```bash
# Check indexer logs
docker compose logs -f indexer

# Verify registered contracts
curl "http://localhost:3004/contracts?page=1&limit=10"

# Check sync status
curl http://localhost:3004/sync
```

### API Not Responding

```bash
# Check API logs
docker compose logs -f api

# Verify API is running
curl http://localhost:3004/health
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request.

# Continuum

An app state migration service that allows projects to migrate public and private state from an old rollup to a new rollup. Continuum indexes events from Aztec contracts and exposes them via a REST API for migration attestation.


# Milestones


Milestone 1: Centralized Migration Infrastructure (Dockerized)
Deliverable: A Dockerized backend service comprising an Indexer, Database, and Attestation Server.
Functionality:
Ingests encrypted event logs from "Rollup A" (old chain) based on start block and end block
Stores encrypted user state mapped to a Migration Secret Key.
Provides an API to generate signed attestations for state migration to Rollup B. Attestation structure is TBD.
Milestone 2: Contract Standards & Developer Abstractions
Deliverable: Standardized smart contract interfaces and a lightweight Client SDK.
Components:
Rollup A Standards: Defined patterns for emitting encrypted logs for private variables.
Rollup B Standards: Interfaces for contracts to verify attestations and re-mint private state.
Client SDK: Abstracted functions for developers to easily implement the "Export -> Attest -> Re-mint" flow in their front ends



Milestone 3: Comprehensive Testing
Unit and Integration Testing for Core logic(JavaScript) and Contracts(Aztec.nr)
Milestone 4: End-to-End Demo (Raven House) & Documentation
Deliverable: Live migration demo and "Plug-and-Play" developer guides.

Scope:
Full migration of Raven House (Public & Private NFTs) using the Milestone 1 infrastructure.
Documentation: A guide for other ecosystem apps on how to add the logging standard to their contracts and run the migration Docker container.





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

3. **Configure artifacts**

   Edit `indexer/artifacts.json` to add your Aztec contract artifacts:
   ```json
   {
     "artifacts": [
       {
         "id": "my-contract",
         "name": "My Contract",
         "artifact_path": "./artifacts/MyContract.json",
         "addresses": {
           "devnet": "0x...",
           "testnet": "0x...",
           "sandbox": "0x..."
         },
         "enabled": true,
         "event_types": ["Transfer", "Mint"],
         "start_block": {
           "devnet": 1000,
           "testnet": 5000,
           "sandbox": 0
         }
       }
     ]
   }
   ```

4. **Start all services**
   ```bash
   docker compose up -d
   ```

   This starts:
   - MongoDB on port 27017
   - Event Indexer (background service)
   - REST API on port 3004

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

`docker-compose.override.yml` is automatically merged in when you run `docker compose up -d` locally. It mounts the source files as volumes so changes are reflected without rebuilding.

```bash
# First time — build images to bake in dependencies
docker compose up -d --build

# After any code change — just restart, no rebuild
docker compose up -d

# Only rebuild when adding/removing npm packages
docker compose up -d --build
```

### Production deploy

In production, explicitly pass only the base file so the override is ignored and self-contained built images are used:

```bash
docker compose -f docker-compose.yml up -d
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

### List Artifacts
```bash
# List all registered artifacts
curl http://localhost:3004/artifacts

# Get specific artifact details
curl http://localhost:3004/artifacts/my-contract
```

### Contract ABI Upload
```bash
# Upload contract ABI and extract events with selectors
curl -X POST http://localhost:3004/contracts/upload \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyContract",
    "abi": { /* Noir ABI JSON */ }
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
├── docker-compose.yml           # Production Docker Compose
├── docker-compose.override.yml  # Dev overrides (auto-merged locally, ignored in prod)
├── docker-compose.local.yml     # Alternative local-only setup
├── .env.example                 # Environment variables template
├── indexer/artifacts.json       # Contract artifacts configuration used by the indexer
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
│
└── artifacts/                   # Contract artifacts (user-provided .json files)
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_ROOT_USERNAME` | MongoDB root username | `root` |
| `MONGO_ROOT_PASSWORD` | MongoDB root password | `password` |
| `CONTINUUM_DB_CONNECTION_STRING` | MongoDB connection string | `mongodb://root:password@localhost:27017` |
| `CONTINUUM_DB_NAME` | Database name | `continuum` |
| `CONTINUUM_INDEXER_INTERVAL` | Indexer run interval (ms) | `30000` |
| `CONTINUUM_INDEXER_BLOCK_RANGE` | Blocks per batch | `14` |
| `CONTINUUM_AZTEC_NODE_URL_DEVNET` | Aztec node URL for devnet | - |
| `CONTINUUM_AZTEC_NODE_URL_TESTNET` | Aztec node URL for testnet | - |
| `CONTINUUM_AZTEC_NODE_URL_SANDBOX` | Aztec node URL for sandbox | `http://sandbox:8080` |
| `CONTINUUM_API_PORT` | API server port | `3004` |
| `CONTINUUM_ARTIFACTS_PATH` | Path to artifacts directory | `./artifacts` |

### Artifact Configuration

Each artifact in `artifacts.json` supports:

- `id`: Unique identifier for the artifact
- `name`: Human-readable name
- `artifact_path`: Path to the contract artifact JSON file
- `addresses`: Contract addresses per network (devnet, testnet, sandbox)
- `enabled`: Whether to index this artifact
- `event_types`: List of event types to index
- `start_block`: Block to start indexing from per network

## Database Collections

| Collection | Purpose |
|---|---|
| `events` | All indexed contract events |
| `sync_state` | Last indexed block per artifact per network |
| `artifacts` | Artifact configuration and metadata |
| `contracts` | Uploaded contract ABIs and extracted event selectors |
| `migration_keys` | Wallet → secret key mappings for rollup migration |

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

# Verify artifact configuration
curl http://localhost:3004/artifacts

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

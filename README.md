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
- Bun or Node.js for local development

### Running with Docker Compose

1. **Clone the repository**

   ```bash
   git clone git@github.com:raven-house/continuum.git
   cd continuum
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   If trying on Aztec Sandbox, download Aztec CLI from https://docs.aztec.network/developers/getting_started_on_local_network and start sandbox using `aztec start --local-network`

   Set `AZTEC_NETWORK=sandbox` in `.env` file

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

List all docker volumes

```bash
docker volume ls
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

```bash
# Run contract test cases
aztec test
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

### Migration Attestations

Migration identity is stateless in the API. Users generate a secret, register
its commitment on the old rollup, then reveal the secret to request signed
claim data for the new rollup. Continuum does not store wallet-to-secret
mappings.

```bash
# Generate a fresh migration secret and commitment
curl http://localhost:3004/migration/new-secret

# Recompute a commitment from a saved secret
curl -X POST http://localhost:3004/migration/commitment \
  -H "Content-Type: application/json" \
  -d '{ "secret": "0x..." }'

# Register the old-rollup collection to new-rollup collection mapping
curl -X POST http://localhost:3004/collections/register \
  -H "Content-Type: application/json" \
  -d '{
    "old_collection_address": "0x...",
    "old_network": "sandbox",
    "new_collection_address": "0x...",
    "new_network": "sandbox",
    "collection_name": "Example NFT"
  }'

# Request Schnorr-signed token claims for a user migration
curl -X POST http://localhost:3004/request_data \
  -H "Content-Type: application/json" \
  -d '{
    "collection_address": "0x...",
    "migration_secret": "0x...",
    "new_wallet_address": "0x..."
  }'

# Fetch the attester public key for new collection constructors
curl http://localhost:3004/attester
```

## Configuration

### Contract Indexing Configuration

Contract indexing configuration is stored in MongoDB when an ABI is uploaded to
`POST /contracts/upload`. The request supports:

- `artifact_id`: Unique identifier used by events and sync state
- `abi`: Noir contract ABI JSON
- `name`: Optional human-readable contract name
- `enabled`: Whether the indexer should index this contract
- `event_types`: Event names to index; omit or leave empty to index all events
- `start_block`: Block to start indexing from per network
- `networks`: Preferred per-network config for new integrations:
  `{ "sandbox": { "start_block": 123, "addresses": ["0x..."] } }`
- `migration`: Optional migration manifest that maps developer contract event
  names/fields to Continuum ownership and claim semantics

Example migration-aware upload:

```json
{
  "artifact_id": "my-nft-v1",
  "name": "MyNFT",
  "abi": {},
  "enabled": true,
  "event_types": ["OwnerChanged", "ReadyToMigrate"],
  "networks": {
    "sandbox": {
      "start_block": 123,
      "addresses": ["0xoldcollection"]
    }
  },
  "migration": {
    "type": "nft",
    "ownership_model": "latest_transfer_event",
    "addresses": ["0xoldcollection"],
    "events": {
      "transfer": {
        "name": "OwnerChanged",
        "token_id": "id",
        "to": "recipient"
      },
      "registration": {
        "name": "ReadyToMigrate",
        "owner": "account",
        "commitment": "commitment"
      }
    },
    "claim": {
      "domain": "0x4e46544d",
      "attestation_fields": ["domain", "new_collection_address", "new_wallet_address", "token_id"]
    }
  }
}
```

If `migration` is omitted, Continuum uses the legacy NFT defaults:
`Transfer.token_id`, `Transfer.to`, `MigrationRegistered.owner`, and
`MigrationRegistered.migration_commitment`.

Collections can optionally pass `artifact_id` to `POST /collections/register`.
That links the old/new collection mapping to the exact uploaded migration
manifest. Without it, Continuum attempts to find a manifest by old collection
address and then falls back to the legacy defaults.

The lowest-change public NFT migration pattern is to keep ownership events in
the application contract and register migration commitments through a generic
registry event with `{ collection, owner, migration_commitment }`. New-rollup
contracts still need a small claim function that verifies Continuum's attestation
before restoring/minting state.

## Database Collections

| Collection            | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `events`              | All indexed contract events                                             |
| `sync_state`          | Last indexed block per artifact per network                             |
| `contracts`           | Uploaded contract ABIs, extracted events, and indexer configuration     |
| `collection_registry` | Old-rollup collection address to new-rollup collection address mappings |

See `database/init.js` for the full schema and indexes. Collections and indexes are created automatically when MongoDB first initializes.

## Troubleshooting

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

## TODOS

- [] if sandbox, check sandbox up and running or not, otherwise stop container, flag with error, etc.
- [] Create a top level script to generate random attestor secret

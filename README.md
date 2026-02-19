# Continuum

An app state migration service that allows projects to migrate public and private state from an old rollup to a new rollup. Continuum indexes events from Aztec contracts and exposes them via a REST API for migration attestation.

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│  MongoDB    │◄───│   Indexer   │◄───│  Fastify API    │
│  (Events &  │    │  (Cron Jobs)│    │  (REST Server)  │
│   SyncState)│    │             │    │                 │
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
   git clone <repository-url>
   cd continuum
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Configure artifacts**
   
   Edit `artifacts.json` to add your Aztec contract artifacts:
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
   docker-compose up -d
   ```

   This will start:
   - MongoDB on port 27017
   - Event Indexer (background service)
   - REST API on port 3000

5. **Check service status**
   ```bash
   docker-compose ps
   ```

6. **View logs**
   ```bash
   # All services
   docker-compose logs -f
   
   # Specific service
   docker-compose logs -f indexer
   docker-compose logs -f api
   docker-compose logs -f mongodb
   ```

7. **Stop services**
   ```bash
   docker-compose down
   ```

   To also remove the MongoDB volume (WARNING: deletes all data):
   ```bash
   docker-compose down -v
   ```

## API Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```

### Get Events
```bash
# Get all events for an artifact
curl http://localhost:3000/events/my-contract

# Get specific event type
curl http://localhost:3000/events/my-contract/Transfer

# With pagination and block range
curl "http://localhost:3000/events/my-contract?event_type=Transfer&from_block=1000&to_block=2000&page=1&limit=100"
```

### Get Sync Status
```bash
# Get sync status for all artifacts
curl http://localhost:3000/sync

# Get sync status for specific artifact
curl http://localhost:3000/sync/my-contract
```

### List Artifacts
```bash
# List all registered artifacts
curl http://localhost:3000/artifacts

# Get specific artifact details
curl http://localhost:3000/artifacts/my-contract
```

## Project Structure

```
continuum/
├── docker-compose.yml        # Docker Compose configuration
├── .env.example             # Environment variables template
├── artifacts.json           # Contract artifacts configuration
│
├── database/                # MongoDB initialization
│   └── init.js             # Database setup script
│
├── functions/               # Event indexer
│   ├── Dockerfile          # Indexer service container
│   ├── index.ts            # Main entry point
│   ├── lib/                # Indexer logic
│   └── shared/             # Shared utilities
│
├── api/                     # REST API server
│   ├── Dockerfile          # API service container
│   ├── app.js              # Fastify app
│   ├── routes/             # API routes
│   └── plugins/            # Fastify plugins
│
└── artifacts/               # Contract artifacts (user-provided)
    └── (your .json files)
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
| `CONTINUUM_AZTEC_NODE_URL_*` | Aztec node URLs per network | - |
| `CONTINUUM_API_PORT` | API server port | `3000` |
| `CONTINUUM_ARTIFACTS_PATH` | Path to artifacts | `./artifacts` |

### Artifact Configuration

Each artifact in `artifacts.json` supports:

- `id`: Unique identifier for the artifact
- `name`: Human-readable name
- `artifact_path`: Path to the contract artifact JSON file
- `addresses`: Contract addresses per network (devnet, testnet, sandbox)
- `enabled`: Whether to index this artifact
- `event_types`: List of event types to index (from `events()` method)
- `start_block`: Block to start indexing from per network

## Development

### Local Development (without Docker)

1. **Install dependencies**
   ```bash
   cd database && npm install
   cd ../functions && bun install
   cd ../api && npm install
   ```

2. **Start MongoDB**
   ```bash
   docker run -d -p 27017:27017 \
     -e MONGO_INITDB_ROOT_USERNAME=root \
     -e MONGO_INITDB_ROOT_PASSWORD=password \
     mongo:7
   ```

3. **Start Indexer**
   ```bash
   cd functions
   cp .env.example .env
   # Edit .env with local settings
   bun run start
   ```

4. **Start API**
   ```bash
   cd api
   cp .env.example .env
   # Edit .env with local settings
   npm run dev
   ```

### Database Schema

The MongoDB database contains three main collections:

- **events**: All indexed events with metadata
- **sync_state**: Last indexed block per artifact
- **artifacts**: Artifact configuration and metadata

See `database/init.js` for the full schema and indexes.

## Troubleshooting

### MongoDB Connection Issues

```bash
# Check MongoDB is running
docker-compose ps mongodb

# Check MongoDB logs
docker-compose logs mongodb

# Connect to MongoDB shell
docker-compose exec mongodb mongosh -u root -p password
```

### Indexer Not Processing Events

```bash
# Check indexer logs
docker-compose logs -f indexer

# Verify artifact configuration
curl http://localhost:3000/artifacts

# Check sync status
curl http://localhost:3000/sync
```

### API Not Responding

```bash
# Check API logs
docker-compose logs -f api

# Verify API is running
curl http://localhost:3000/health
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request.

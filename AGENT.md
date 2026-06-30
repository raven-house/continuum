# AGENT.md

## Project Overview

Continuum is a cryptographic bridge that lets users carry state forward when an Aztec L2 rollup upgrades. When a rollup migrates to a new version, all on-chain state is reset. Continuum indexes events from the old rollup, attests to user state claims with Schnorr signatures, and verifies those attestations via a Noir contract on the new rollup.

## Tech Stack

- **Package manager / runtime**: Bun (used across all JS/TS packages)
- **API server**: Fastify v4 (ESM, Node/Bun), MongoDB via `@fastify/mongodb`
- **Indexer**: TypeScript with `@aztec/aztec.js`, MongoDB, `node-cron`, Winston/Pino logging
- **Database**: MongoDB (collections: `events`, `sync_state`, `contracts`, `collection_registry`)
- **Smart contracts**: Noir, Aztec v5.0.0-rc.1 (contracts under `contracts/`)
- **E2E tests**: Bun + `@aztec/aztec.js` (sandbox and testnet flows)
- **Linting**: ESLint flat config + Prettier (per-package configs in `api/` and `indexer/`)
- **Containerization**: Docker Compose (dev: `docker-compose.yml`, prod: `docker-compose.prod.yml`)

## Directory Structure

```
continuum/
├── api/                  # Fastify REST API server (also acts as attester)
│   ├── app.js            # Fastify app definition (autoloads plugins + routes)
│   ├── index.js          # Server bootstrap
│   ├── plugins/          # Fastify plugins (cors, env, mongodb, swagger, etc.)
│   ├── routes/           # Route handlers grouped by feature
│   │   ├── attester/
│   │   ├── collections/
│   │   ├── contracts/
│   │   ├── health/
│   │   ├── migration/
│   │   └── request_data/
│   ├── services/         # Business logic (abiProcessor, attester, migrationData)
│   ├── shared/            # Shared config and JSON schemas
│   └── test/             # Node test runner tests
├── indexer/               # Event indexer service (TS, cron-based)
│   ├── index.ts           # Entry point — cron loop + handler
│   └── types.d.ts
├── contracts/             # Noir smart contracts
│   ├── nft_contract/      # Example NFT contract with migration support
│   ├── migration_registry/ # Registry for user migration commitments
│   ├── attestation_lib/  # Shared attestation verification library
│   └── generic_proxy/    # Generic proxy contract
├── e2e-tests/             # End-to-end test scripts (sandbox + testnet)
├── database/              # MongoDB init scripts (init.js)
├── docker-compose.yml     # Local development stack
├── docker-compose.prod.yml # Production stack (built images, no source mounts)
├── Makefile               # Convenience commands (make up, make logs, etc.)
└── .env.example           # Environment variable template
```

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│  MongoDB    │◄───│   Indexer   │◄───│  Aztec Old Node │
│  (Events,   │    │  (Cron Jobs)│    │  (Event Source) │
│   SyncState,│    │             │    └─────────────────┘
│   Migration)│    └─────────────┘
└──────┬──────┘                     ┌─────────────────┐
       │                            │  Fastify API    │
       └───────────────────────────│  (REST +        │
                                    │   Attester)     │
                                    │  :3004          │
                                    └─────────────────┘
```

- The **Indexer** polls an Aztec node for events from registered contracts and persists them in MongoDB.
- The **API server** exposes REST endpoints for contract registration, event queries, migration secrets, and Schnorr-signed attestation data.
- The **attester** (part of the API) derives a Schnorr signing key from `ATTESTER_SECRET` and signs migration claims that Noir contracts verify on the new rollup.

## Development

### Prerequisites

- [Bun](https://bun.sh) installed
- [Aztec CLI](https://docs.aztec.network/developers/getting_started_on_local_network) (for sandbox testing)
- Docker & Docker Compose (for containerized runs)
- [Nargo](https://docs.aztec.network/) compiler (for Noir contracts)

### Environment Setup

```bash
cp .env.example .env
# For sandbox testing: set AZTEC_NETWORK=sandbox and start `aztec start --local-network`
# Generate an attester secret:
cd e2e-tests && bun run generate-attester-secret
```

### Running Services

```bash
# Via Docker Compose (recommended)
make up              # Start all services (local dev)
make prod            # Start in production mode (built images)
make down            # Stop services
make logs            # View all logs
make logs-api        # View API logs
make logs-indexer    # View indexer logs
make health          # Check API health + running containers
make status          # Check sync status

# Direct (without Docker)
cd api && bun run dev        # API with --watch (hot reload)
cd indexer && bun run start  # Indexer
```

### Noir Contracts

```bash
cd contracts/nft_contract
nargo compile

cd contracts/migration_registry
nargo compile
```

### E2E Tests

```bash
cd e2e-tests
bun run migrate-nft:sandbox    # Run NFT migration on Aztec sandbox
bun run migrate-nft:testnet    # Run NFT migration on testnet (needs L1_PRIVATE_KEY)
bun run generate-attester-secret  # Generate a fresh Schnorr attester key
```

## Coding Conventions

### JavaScript / TypeScript (API + Indexer)

- **ESM only** — all packages use `"type": "module"`. Use `import`/`export`, never `require`.
- **Prettier config** (api/): `singleQuote: true`, `arrowParens: 'avoid'`, `trailingComma: 'none'`.
- **ESLint**: flat config with `jsdoc` + `prettier` plugins. `sort-imports` is enabled (warn). Run `bun run lint` in each package.
- **JSDoc**: required on exported functions (enforced by `eslint-plugin-jsdoc`). Keep descriptions concise.
- **Fastify patterns**: routes use autoload — each route folder has an `index.js` registering its handlers. Validation schemas go in `schemas.js` alongside the route.
- **Services**: business logic lives in `api/services/`, not in route handlers. Routes call services, services call DB/plugins.
- **Shared config**: `api/shared/config.js` reads env vars with sensible defaults. Add new env vars here and to `.env.example`.
- **BigInt serialization**: `app.js` patches `BigInt.prototype.toJSON` to return a string — do not override this.

### Noir Contracts

- Contracts target Aztec v5.0.0-rc.1 (pinned in `Nargo.toml` via git tag).
- Internal tests live in `src/test/` alongside `src/main.nr`.
- Shared logic goes in `attestation_lib` (library type), not duplicated in each contract.
- The `MIGRATE_DOMAIN` constant (`0x4e46544d` = "NFTM") must stay in sync between the API (`attester.js`) and `nft_contract/src/main.nr`.

## API Endpoints (port 3004)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/contracts/upload` | Register contract ABI for indexing |
| GET | `/contracts` | List registered contracts |
| GET | `/events/:artifact_id` | Get indexed events |
| GET | `/sync` | Get sync status |
| GET | `/sync/:artifact_id` | Get sync status for specific artifact |
| GET | `/migration/new-secret` | Generate a migration secret + commitment |
| POST | `/migration/commitment` | Recompute commitment from a secret |
| POST | `/collections/register` | Register old→new collection address mapping |
| POST | `/request_data` | Request Schnorr-signed attestation for a migration |
| GET | `/attester` | Fetch attester public key |

## Key Domain Concepts

- **Migration commitment**: `Poseidon2([ MIGRATE_REGISTER_DOMAIN, secret ])` — computed off-chain by the user, stored on the old rollup via `register_migration`. The secret is later revealed to Continuum to verify ownership.
- **Attestation**: The attester signs a claim (domain, collection address, wallet address, token ID) with a Schnorr key derived from `ATTESTER_SECRET`. The new-rollup contract verifies this signature before restoring state.
- **Collection registry**: Maps old-rollup collection addresses to new-rollup collection addresses. Optionally linked to an `artifact_id` for migration manifest lookup.
- **Migration manifest**: Optional config on contract upload that maps developer-specific event names/fields to Continuum ownership semantics. Falls back to legacy NFT defaults if omitted.

## Testing

- **Unit tests**: `api/test/` — run with `cd api && bun run test` (uses Node's built-in test runner).
- **E2E tests**: `e2e-tests/` — sandbox and testnet migration flows.
- **Noir tests**: `nargo test` in each contract directory.

## Important Notes

- `ATTESTER_SECRET` is the root of trust. In production, always generate a fresh key with `bun run generate-attester-secret`. Never commit real secrets.
- The indexer is cron-based (`CONTINUUM_INDEXER_INTERVAL` controls polling frequency, default 25–30s).
- `NODE_ENV=production` is the default in `.env.example` — set to `development` if needed for debug logging.
- When modifying attestation logic, ensure the API (`attester.js`) and Noir contracts (`attestation_lib`, `nft_contract`) stay in sync — domain separators and field orderings must match exactly.

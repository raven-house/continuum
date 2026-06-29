# Continuum E2E Tests

Runnable end-to-end scripts that exercise the Continuum migration flow against a
real Aztec node + the Continuum HTTP stack.

```bash
cd continuum/e2e-tests
bun install
```

## Pick the cheapest loop that covers your change

Don't run the slow testnet flow to iterate — fee-juice bridging, remote proving,
and slow block times test none of the logic you're changing. Three tiers:

| Tier | What it covers | Cost | Command |
|---|---|---|---|
| **1. API logic** | `/request_data` ownership resolution + signing, the attester, the migration helpers — everything off-chain | seconds, no chain, no indexer | `cd ../api && bun run test:request-data` |
| **2. Sandbox** | + on-chain `migrate_and_claim` + indexer decoding | ~1 min | `AZTEC_NODE_URL=http://localhost:8080 CONTINUUM_NETWORK=sandbox bun run migrate-nft` |
| **3. Testnet** | full production path | slow (minutes) | `L1_PRIVATE_KEY=0x... bun run migrate-nft` |

Keep Mongo + API running between runs (the API uses `fastify start -w`, so it
hot-reloads on save). Most iteration happens in **Tier 1**.

### Tier 1 — `api/scripts/test-request-data.mjs`

Seeds fake `MigrationRegistered` + `Transfer` docs straight into Mongo (the shape
the indexer produces) and calls the live `/request_data`, asserting the right
tokens are selected and signed — including a transferred-away token and a
third-party token that must be excluded. No contracts, no fee juice, no waiting.

```bash
# needs Mongo + API running
cd continuum/api && bun run test:request-data
```

### Tier 2 — sandbox tips

- Start once: `aztec start --local-network` (→ `http://localhost:8080`), and point
  the indexer at it (`CONTINUUM_AZTEC_NODE_URL_SANDBOX=http://localhost:8080`,
  run with `CONTINUUM_NETWORK=sandbox`).
- Reuse funded accounts across runs with `OLD_SECRET/OLD_SALT`, `NEW_SECRET/NEW_SALT`
  so you skip account setup.

## `migrate-nft` — NFT public-state migration (full stack)

Drives the **entire** public-NFT migration end to end: deploys an "old" and a
"new" NFT collection, mints public NFTs, registers migration on-chain, gets
attestations from the live API, claims on the new collection, and verifies the
result (including double-claim rejection).

### What it proves

The migration identity check is enforced **on-chain**, not by a trusted API:

1. The real owner calls `register_migration(commitment)` on the old rollup. The
   contract emits `MigrationRegistered { owner: msg_sender, migration_commitment }` —
   `owner` is the authenticated sender and cannot be spoofed.
2. `commitment = Poseidon2([MIGRATE_REGISTER_DOMAIN, secret])`. The user fetches a
   fresh `secret`/`commitment` from `GET /migration/new-secret`, registers the
   commitment, and saves the secret.
3. On the new rollup the user reveals the `secret` to `POST /request_data`.
   Continuum recomputes the commitment, resolves the verified owner from the
   indexed event, finds tokens whose latest `Transfer.to` is that owner, and
   Schnorr-signs `[MIGRATE_DOMAIN, new_collection, new_wallet, token_id]` per token.
4. The new wallet calls `migrate_and_claim(token_id, signature)`; the signature is
   verified in the contract's private context and the NFT is recreated as a
   private note.

### Prerequisites

Start the Continuum services first (from `continuum/`):

```bash
# MongoDB
docker compose -f docker-compose.local.yml up -d
cd database && bun run init && cd ..

# API (needs ATTESTER_SECRET in api/.env) — http://localhost:3004
cd api && bun run dev

# Indexer — must run for the SAME network as AZTEC_NODE_URL
cd indexer && bun start
```

You also need an Aztec node:
- **Testnet** (default): `https://v5.testnet.rpc.aztec-labs.com` + a Sepolia-funded
  `L1_PRIVATE_KEY` (used to bridge fee juice for the two test accounts).
- **Sandbox**: `aztec start --local-network` → `http://localhost:8080` (no L1 key).

### Run

```bash
# Testnet (default) — slow: each account bridges fee juice and proving takes minutes
L1_PRIVATE_KEY=0x... bun run migrate-nft

# Sandbox — fast
AZTEC_NODE_URL=http://localhost:8080 CONTINUUM_NETWORK=sandbox bun run migrate-nft
```

### Env vars

| Var | Default | Notes |
|---|---|---|
| `AZTEC_NODE_URL` | `https://v5.testnet.rpc.aztec-labs.com` | Aztec node |
| `CONTINUUM_API_URL` | `http://localhost:3004` | Continuum API base URL |
| `CONTINUUM_NETWORK` | `testnet` | Must match the indexer's network |
| `L1_PRIVATE_KEY` | — | Sepolia-funded key (testnet only) |
| `OLD_SECRET`/`OLD_SALT`, `NEW_SECRET`/`NEW_SALT` | random | Reuse funded accounts across runs |

> The script loads the compiled artifact at
> `contracts/nft_contract/target/nft_contract-NFT.json` (the codegen `NFT.ts`
> wrapper is stale and not used).

## Other scripts

| Script | Purpose |
|---|---|
| `deploy-migration` / `claim-migration` | Standalone `MigrationClaims` Schnorr-attestation demo (see `../RUN_ATTESTATION_FLOW.md`) |
| `deploy-example` | Deploy the example contract |

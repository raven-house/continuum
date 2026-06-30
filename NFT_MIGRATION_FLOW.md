# NFT Migration Flow — Raven House Continuum

This document explains the full end-to-end flow for migrating NFT ownership from an old Aztec rollup to a new one, using Schnorr attestation provided by the Continuum service.

---

## The Problem

When Aztec upgrades its rollup (rollup A → rollup B), all on-chain state resets. NFTs that existed on rollup A do not automatically appear on rollup B. Users need a trustless way to prove "I owned token #N on rollup A — let me claim it on rollup B."

Continuum solves this by:
1. **Indexing** public `MetadataUpdate` events from the old rollup (who owns which token)
2. **Attesting** that ownership with a Schnorr signature off-chain
3. **Verifying** that signature on-chain in the new rollup's NFT contract

---

## Actors

| Actor | Role |
|---|---|
| **Continuum** | Off-chain service: event indexer + attester API |
| **Collection Owner** | Deploys a new NFT contract on the new rollup with migration support |
| **Alice (user)** | Had NFTs on old rollup, wants to claim them on new rollup |

---

## Full Flow Diagram

```
OLD ROLLUP (deprecated)
│
│  NFT Contract emits MetadataUpdate { token_id, owner }
│  Continuum indexes these into MongoDB events collection
│
│  Alice (while old rollup is still live):
│    POST /migration/register { walletAddress: 0xOLD_ALICE }
│    → stored: secretKey K1 <-> 0xOLD_ALICE
│
═══════════ ROLLUP RESET ════════════════════════════════════════
│
NEW ROLLUP (current)
│
│  Collection owner:
│    1. GET /attester  --> gets pubkey X, Y
│    2. Deploys new NFT contract with migration_attester_pubkey_x/y
│    3. POST /collections/register { old_address, new_address }
│
│  Alice (on new rollup):
│    POST /request_data {
│      collection_address: 0xNEW_COLLECTION,
│      migration_key: K1,
│      new_wallet_address: 0xNEW_ALICE
│    }
│    --> Continuum checks events, signs each owned token
│    --> Returns [{ token_id, signature_bytes }]
│
│  Alice calls on-chain (once per token):
│    NFTContract.migrate_and_claim(token_id, signature_bytes)
│    --> Private: verify Schnorr sig, insert NFTNote
│    --> Public (enqueued): assert !nft_exists, record token
```

---

## Step-by-Step: E2E Testing Guide

### Prerequisites

```bash
# 1. MongoDB running
cd continuum
docker compose up -d

# 2. Continuum API — set env vars then start
cd continuum/api
cp .env.example .env
# Edit .env: set ATTESTER_SECRET to any 32-byte hex
# e.g. ATTESTER_SECRET=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

bun run dev   # starts on :3004

# 3. Aztec sandbox (for on-chain step)
aztec start --local-network
```

---

### Step 1 — Get the attester public key

The collection owner needs the attester's Grumpkin public key to deploy the NFT contract with migration enabled.

```bash
GET http://localhost:3004/attester
```

Response:
```json
{
  "x": "0x1a2b3c...",
  "y": "0x4d5e6f..."
}
```

Save these two values. They go into the NFT contract constructor.

---

### Step 2 — Seed old rollup events (test only)

In a real scenario Continuum's indexer has already populated these. For local testing, insert fake `MetadataUpdate` events directly into MongoDB:

```js
// scripts/seed-events.js  (run with: node scripts/seed-events.js)
import { MongoClient } from 'mongodb';

const OLD_COLLECTION = '0xdeadbeef...'; // your old collection address (lowercase)
const OLD_WALLET     = '0xaabbccdd...'; // Alice's old wallet address (lowercase)

const client = await MongoClient.connect('mongodb://root:password@localhost:27017');
const db = client.db('continuum');

await db.collection('events').insertMany([
  {
    contract_address: OLD_COLLECTION,
    event_type: 'MetadataUpdate',
    block_number: 100,
    data: { token_id: '1', owner: OLD_WALLET }
  },
  {
    contract_address: OLD_COLLECTION,
    event_type: 'MetadataUpdate',
    block_number: 101,
    data: { token_id: '5', owner: OLD_WALLET }
  },
  {
    contract_address: OLD_COLLECTION,
    event_type: 'MetadataUpdate',
    block_number: 102,
    data: { token_id: '42', owner: OLD_WALLET }
  }
]);

await client.close();
console.log('Seeded 3 MetadataUpdate events');
```

---

### Step 3 — Alice registers a migration key (old rollup, before reset)

Alice does this while the old rollup is still running, from the old frontend or directly:

```bash
POST http://localhost:3004/migration/register
{
  "walletAddress": "0xOLD_ALICE",
  "network": "devnet"
}
```

Response:
```json
{
  "secretKey": "a3f7c2...",   // 64 hex chars — Alice must save this
  "walletAddress": "0xold_alice",
  "isNew": true
}
```

**Alice must save `secretKey`** — this is the only thing linking her old wallet to her new one.

---

### Step 4 — Collection owner deploys new NFT contract

Deploy the NFT contract on the new rollup, passing the attester pubkey from Step 1:

```typescript
// In your deployment script
const nftContract = await NFTContract.deploy(
  wallet,
  adminAddress,       // admin
  'Anon Panku',       // name
  'ANKP',             // symbol
  erc20TokenAddress,  // erc20_token
  true,               // is_mint_public
  0,                  // mint_limit_per_wallet (0 = no limit)
  1000,               // max_supply
  0n,                 // mint_price
  0n,                 // whitelist_mint_price
  0n,                 // public_start_unix
  0n,                 // whitelist_start_unix
  0n,                 // public_mint_time_secs
  0n,                 // whitelist_mint_time_secs
  adminAddress,       // upgrade_authority
  BigInt('0x1a2b3c...'), // migration_attester_pubkey_x  <-- from Step 1
  BigInt('0x4d5e6f...'), // migration_attester_pubkey_y  <-- from Step 1
).send().deployed();

console.log('New collection:', nftContract.address.toString());
```

To deploy **without** migration support, pass `0n, 0n` for the last two params.

---

### Step 5 — Collection owner registers the address mapping

```bash
POST http://localhost:3004/collections/register
{
  "old_collection_address": "0xOLD_COLLECTION",
  "old_network": "devnet",
  "new_collection_address": "0xNEW_COLLECTION",
  "new_network": "devnet2",
  "collection_name": "Anon Panku"
}
```

This is idempotent — safe to call again if the address changes.

---

### Step 6 — Alice requests signed migration data

On the new rollup's frontend, Alice enters her migration key:

```bash
POST http://localhost:3004/request_data
{
  "collection_address": "0xNEW_COLLECTION",
  "migration_key": "a3f7c2...",
  "new_wallet_address": "0xNEW_ALICE",
  "event_name": "MetadataUpdate"
}
```

What Continuum does internally:
1. Resolves `migration_key` → `0xOLD_ALICE`
2. Resolves `0xNEW_COLLECTION` → `0xOLD_COLLECTION` (via collection_registry)
3. Runs aggregation on `events`: find latest owner per `token_id` for `0xOLD_COLLECTION`, keep only those where `latest_owner == 0xOLD_ALICE`
4. For each token, signs: `Poseidon2([MIGRATE_DOMAIN, 0xNEW_COLLECTION, 0xNEW_ALICE, token_id])`

Response:
```json
{
  "old_wallet_address": "0xold_alice",
  "new_wallet_address": "0xnew_alice",
  "collection_address": "0xnew_collection",
  "old_collection_address": "0xold_collection",
  "tokens": [
    { "token_id": "1",  "signature": "0x...", "signature_bytes": [12, 34, ...] },
    { "token_id": "5",  "signature": "0x...", "signature_bytes": [...] },
    { "token_id": "42", "signature": "0x...", "signature_bytes": [...] }
  ]
}
```

---

### Step 7 — Alice claims each token on-chain

```typescript
import { NFTContract } from './artifacts/l2';

const contract = await NFTContract.at(newCollectionAddress, aliceWallet);

for (const token of migrationData.tokens) {
  console.log(`Claiming token #${token.token_id}...`);
  await contract.methods
    .migrate_and_claim(token.token_id, token.signature_bytes)
    .send()
    .wait();
  console.log(`Token #${token.token_id} claimed`);
}
```

**What happens on-chain:**

Private context (`migrate_and_claim`):
1. Read `migration_attester` pubkey from `PublicImmutable`
2. Assert `attester_pubkey_x != 0` (migration is enabled)
3. Compute `hash = Poseidon2([MIGRATE_DOMAIN, this_address, msg_sender, token_id])`
4. `assert_valid_attestation(pubkey, signature, fields)` — verifies Schnorr sig
5. Insert `NFTNote { token_id }` into Alice's private notes (delivered on-chain constrained)
6. Enqueue public call: `_finalize_migration_claim(alice, token_id)`

Public context (`_finalize_migration_claim`, `#[only_self]`):
1. Assert `nft_exists[token_id] == false` — double-claim protection
2. Set `nft_exists[token_id] = true`
3. Set `public_owners[token_id] = AztecAddress::zero()` (marks as privately owned)
4. Increment `total_nft_count` and `owner_nft_count[alice]`
5. Emit `MetadataUpdate { token_id, owner: zero }` (Continuum picks this up on new rollup)

---

## Cryptographic Details

### Signed Fields

```
hash = Poseidon2([MIGRATE_DOMAIN, new_collection_address, new_wallet_address, token_id])
```

| Field | Value | Purpose |
|---|---|---|
| `MIGRATE_DOMAIN` | `0x4e46544d` ("NFTM") | Prevents replay against other contract methods |
| `new_collection_address` | contract `this_address` | Binds signature to this specific collection |
| `new_wallet_address` | `msg_sender` at claim time | Only Alice can use her own signatures |
| `token_id` | the specific token | One signature per token |

### Security Properties

| Property | Enforcement |
|---|---|
| Only legitimate owners can claim | Continuum checks old-rollup events before signing |
| Signature can't be used by another wallet | `msg_sender` is a signed field |
| Signature can't be replayed on another collection | `contract_address` is a signed field |
| Cross-method replay prevented | `MIGRATE_DOMAIN` is unique to `migrate_and_claim` |
| Double-claim impossible | `nft_exists[token_id]` checked in public context |
| Migration-disabled collections are safe | `assert(attester_pubkey_x != 0)` |

### Why private context for signature verification?

Aztec's private VM supports Blake2s (required for Schnorr verification). The AVM (public functions) does not. The note insertion must also happen in private context. The state update (`nft_exists`, `owner_nft_count`) is enqueued as an internal public call via `_finalize_migration_claim`.

---

## MongoDB Collections Used

| Collection | Contents |
|---|---|
| `migration_keys` | `{ walletAddress, secretKey, network, createdAt }` |
| `collection_registry` | `{ old_collection_address, new_collection_address, old_network, new_network, collection_name }` |
| `events` | `{ contract_address, event_type, block_number, data: { token_id, owner } }` |

---

## Environment Variables

```bash
# Continuum API (.env)
ATTESTER_SECRET=0x<32-byte-hex>        # Schnorr signing key — keep secret
CONTINUUM_DB_CONNECTION_STRING=mongodb://root:password@localhost:27017
CONTINUUM_DB_NAME=continuum
```

The attester's public key is derived from `ATTESTER_SECRET` at startup. Retrieve it via `GET /attester` — those X/Y values are what collection owners embed in their NFT contract constructor.

---

## API Reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/attester` | Get attester's Grumpkin public key (X, Y) |
| `POST` | `/migration/register` | Register migration key for a wallet address |
| `GET` | `/migration/:wallet` | Check if a wallet has a migration key |
| `POST` | `/migration/verify` | Resolve secret key → wallet address |
| `POST` | `/migration/recover` | List all old-rollup events for a wallet |
| `POST` | `/collections/register` | Map old collection address → new collection address |
| `GET` | `/collections/:newAddress` | Lookup a collection mapping |
| `GET` | `/collections` | List all registered collections |
| `POST` | `/request_data` | Get signed attestation data for all owned tokens |

---

## Notes on Token URIs

Token URIs are **not** included in the attestation. The collection owner is responsible for setting `base_uri` on the new rollup contract before migration opens. Migrated NFTs inherit the base URI automatically.

---

## Contract Standard

Collections that want to support migration MUST pass the Continuum attester pubkey to their constructor. Passing `x = 0, y = 0` deploys without migration support — `migrate_and_claim` will revert immediately.

The `attestation_lib` Noir library used for on-chain verification lives at:
`raven-house-app/packages/omni-sdk/src/contracts/l2/attestation_lib/`
